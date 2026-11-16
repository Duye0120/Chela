package chat

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Duye0120/Chela/native/internal/storage"
)

const newChatTitle = "新对话"

type ChatMessage struct {
	ID        string `json:"id"`
	Role      string `json:"role"`
	Thinking  string `json:"thinking,omitempty"`
	Tokens    int    `json:"tokens,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
	Delivery  string `json:"delivery,omitempty"`
}

type ChatSession struct {
	ID          string        `json:"id"`
	AssistantID string        `json:"assistantId"`
	BranchID    string        `json:"branchId"`
	Revision    int64         `json:"revision"`
	Generation  int64         `json:"generation"`
	Project     string        `json:"project,omitempty"`
	Group       string        `json:"group,omitempty"`
	ModelID     string        `json:"modelId,omitempty"`
	Effort      string        `json:"effort,omitempty"`
	Title       string        `json:"title"`
	Pinned      bool          `json:"pinned"`
	Archived    bool          `json:"archived"`
	CreatedAt   string        `json:"createdAt"`
	UpdatedAt   string        `json:"updatedAt"`
	Messages    []ChatMessage `json:"messages"`
}

type ChatSnapshot struct {
	Sessions     []ChatSession `json:"sessions"`
	Models       []modelInfo   `json:"models"`
	Effort       string        `json:"effort"`
	Model        string        `json:"model"`
	AssistantID  string        `json:"assistantId"`
	Cursor       string        `json:"snapshot_cursor"`
	Runs         []Run         `json:"runs"`
	Approvals    []Approval    `json:"approvals"`
	RuntimeError string        `json:"runtimeError,omitempty"`
}

type Chat struct {
	mu           sync.Mutex
	profile      string
	config       string
	sending      map[string]*generation
	pool         map[string]*piWorker
	fileMu       sync.Mutex
	closed       bool
	store        *storage.Store
	imported     bool
	started      bool
	lifetime     context.Context
	stopLifetime context.CancelFunc
	wake         chan struct{}
	workers      sync.WaitGroup
	runtimeError string
	runtimeDir   string
	mcpMu        sync.Mutex
	mcpClients   map[string]*mcpSlot
}

type generation struct {
	cancel         context.CancelFunc
	runID          string
	lane           string
	text, thinking strings.Builder
}

func (c *Chat) Progress(id string) map[string]string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if g := c.sending[id]; g != nil {
		return map[string]string{"text": g.text.String(), "thinking": g.thinking.String()}
	}
	return nil
}
func (c *Chat) Stop(id string) error {
	c.mu.Lock()
	g := c.sending[id]
	c.mu.Unlock()
	if g != nil {
		return c.Cancel(g.runID)
	}
	return nil
}
func New(profile string, store *storage.Store) (*Chat, func()) {
	config := os.Getenv("CHELA_PROVIDER_DIR")
	if config == "" {
		base, _ := os.UserConfigDir()
		config = filepath.Join(base, "Chela")
	}
	c := &Chat{config: config, profile: profile, sending: make(map[string]*generation), store: store}
	c.lifetime, c.stopLifetime = context.WithCancel(context.Background())
	c.wake = make(chan struct{}, 1)
	c.pool = make(map[string]*piWorker)
	return c, c.shutdown
}

func chatTime() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func (c *Chat) Create() (ChatSession, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := chatTime()
	session := ChatSession{
		ID: rand.Text(), Title: newChatTitle, CreatedAt: now, UpdatedAt: now,
		Messages: []ChatMessage{},
	}
	if err := c.save(session); err != nil {
		return ChatSession{}, err
	}
	return c.find(session.ID)
}

func (c *Chat) update(id string, change func(*ChatSession)) (ChatSession, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.updateLocked(id, change)
}

func (c *Chat) updateLocked(id string, change func(*ChatSession)) (ChatSession, error) {
	session, err := c.find(id)
	if err != nil {
		return ChatSession{}, err
	}
	change(&session)
	session.UpdatedAt = chatTime()
	if err := c.save(session); err != nil {
		return ChatSession{}, err
	}
	return c.find(session.ID)
}

func (c *Chat) Rename(id, title string) (ChatSession, error) {
	title = strings.TrimSpace(title)
	if title == "" || utf8.RuneCountInString(title) > 200 {
		return ChatSession{}, errors.New("对话名称需要 1 至 200 个字符")
	}
	return c.update(id, func(s *ChatSession) { s.Title = title })
}

func (c *Chat) Pin(id string, pinned bool) (ChatSession, error) {
	return c.update(id, func(s *ChatSession) { s.Pinned = pinned })
}

func (c *Chat) Archive(id string, archived bool) (ChatSession, error) {
	return c.update(id, func(s *ChatSession) { s.Archived = archived })
}

func (c *Chat) Delete(id string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sending[id] != nil {
		return errors.New("请等待当前回复完成后再删除对话")
	}
	db, err := c.database()
	if err != nil {
		return err
	}
	var pending int
	if err := db.QueryRow("SELECT count(*) FROM runs WHERE session_id=? AND state NOT IN ('succeeded','failed','cancelled','interrupted')", id).Scan(&pending); err != nil {
		return err
	}
	if pending > 0 {
		return errors.New("请先停止运行并取消排队消息，再删除对话")
	}
	session, err := c.find(id)
	if err != nil {
		return err
	}
	return c.store.Update(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE sessions SET deleted_at=?,revision=revision+1 WHERE session_id=?", storage.Now(), id); err != nil {
			return err
		}
		_, err := storage.AppendEvent(tx, session.AssistantID, "session.deleted", "session", id, session.Revision+1, "session", id, id, map[string]string{"session_id": id})
		return err
	})
}

// Send remains for existing clients; cancelling the view only stops this wait.
func (c *Chat) Send(ctx context.Context, id, text, modelID, effort string) (ChatSession, error) {
	receipt, err := c.Submit(id, text, modelID, effort, rand.Text())
	if err != nil {
		return ChatSession{}, err
	}
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		run, err := c.GetRun(receipt.RunID)
		if err != nil {
			return ChatSession{}, err
		}
		if terminalRun(run.State) {
			if run.State != "succeeded" {
				return ChatSession{}, errors.New(run.Reason)
			}
			c.mu.Lock()
			result, err := c.find(id)
			c.mu.Unlock()
			return result, err
		}
		select {
		case <-ctx.Done():
			return ChatSession{}, ctx.Err()
		case <-ticker.C:
		}
	}
}
