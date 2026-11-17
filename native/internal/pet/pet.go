package pet

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
)

type Pet struct {
	store *storage.Store
	work  *work.Work
}
type rectangle struct{ X, Y, Width, Height int }
type surface struct {
	Ready, Locked, Busy, Focused, Visible bool
	Bounds, Area                          rectangle
}

func New(store *storage.Store, work *work.Work) *Pet { return &Pet{store: store, work: work} }
func (p *Pet) surface() (surface, error) {
	var state surface
	err := desktop.Invoke("Pet.Presence", &state)
	return state, err
}

type Snapshot struct {
	State        string                  `json:"state"`
	Side         string                  `json:"side"`
	Emotion      string                  `json:"emotion"`
	Motion       bool                    `json:"motion"`
	Presentation *companion.Presentation `json:"presentation"`
}

func (p *Pet) Snapshot() (Snapshot, error) {
	result := Snapshot{State: "hidden", Emotion: "neutral"}
	state, err := p.surface()
	if err != nil {
		return result, err
	}
	if !state.Ready {
		return result, nil
	}
	assistant, err := p.store.Identity()
	if err != nil {
		return result, err
	}
	locked, fullscreen := systemPresence()
	presence := companion.Presence{Locked: locked || state.Locked, Fullscreen: fullscreen, Busy: state.Busy}
	var cfg companion.Settings
	err = p.store.Update(context.Background(), func(tx *sql.Tx) error {
		var e error
		cfg, e = companion.LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		presence.Hidden = cfg.PetHidden
		result.Motion = cfg.PetMotion
		a, e := companion.LoadAffect(tx, assistant, time.Now())
		if e != nil {
			return e
		}
		result.Emotion = companion.ExpressionFor(a, cfg.Mode).Emotion
		result.Presentation, e = companion.NextPresentation(tx, assistant, presence, time.Now())
		if e != nil {
			return e
		}
		result.State = "idle"
		var state, expression string
		e = tx.QueryRow(`SELECT r.state,COALESCE(s.snapshot_json,'{}') FROM runs r LEFT JOIN run_expression_snapshots s ON s.run_id=r.run_id WHERE r.origin IN ('user','recovery') AND r.state IN ('starting','running','waiting_approval','waiting_input','cancelling') ORDER BY r.created_at LIMIT 1`).Scan(&state, &expression)
		if e == nil {
			result.State = "thinking"
			if state == "waiting_approval" || state == "waiting_input" {
				result.State = "listening"
			}
			var frozen companion.Expression
			if e = json.Unmarshal([]byte(expression), &frozen); e != nil {
				return e
			}
			if frozen.Emotion != "" {
				result.Emotion = frozen.Emotion
			}
		} else if !errors.Is(e, sql.ErrNoRows) {
			return e
		}
		if result.Presentation != nil {
			result.State = "speaking"
			result.Emotion = result.Presentation.Emotion
		}
		return nil
	})
	if err != nil {
		return result, err
	}
	bounds, area := state.Bounds, state.Area
	result.Side = "right"
	if bounds.X+bounds.Width/2 < area.X+area.Width/2 {
		result.Side = "left"
	}
	if result.State == "idle" && !state.Focused && (bounds.X <= area.X+2 || bounds.X+bounds.Width >= area.X+area.Width-2) {
		result.State = "peeking"
	}
	if presence.Locked || cfg.PetHidden || (presence.Fullscreen && result.Presentation == nil) {
		result.State = "hidden"
	}
	if err := desktop.Invoke("Pet.Visibility", nil, result.State == "hidden"); err != nil {
		return result, err
	}
	return result, nil
}

func (p *Pet) Acknowledge(id string) error {
	s, err := p.Snapshot()
	if err != nil {
		return err
	}
	if s.Presentation == nil || s.Presentation.ID != id {
		return nil
	}
	return p.store.Update(context.Background(), func(tx *sql.Tx) error { return companion.AcknowledgePresentation(tx, id, time.Now()) })
}

func (p *Pet) Dismiss(id string) error {
	return p.store.Update(context.Background(), func(tx *sql.Tx) error { return companion.DismissPresentation(tx, id, time.Now()) })
}

func (p *Pet) SetHidden(hidden bool) error {
	assistant, err := p.store.Identity()
	if err != nil {
		return err
	}
	err = p.store.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := companion.LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.PetHidden = hidden
		_, e = companion.SaveSettings(tx, assistant, cfg)
		return e
	})
	if err == nil {
		err = desktop.Invoke("Pet.Visibility", nil, hidden)
	}
	return err
}

func (p *Pet) SetMotion(motion bool) error {
	assistant, err := p.store.Identity()
	if err != nil {
		return err
	}
	return p.store.Update(context.Background(), func(tx *sql.Tx) error {
		cfg, e := companion.LoadSettings(tx, assistant)
		if e != nil {
			return e
		}
		cfg.PetMotion = motion
		_, e = companion.SaveSettings(tx, assistant, cfg)
		return e
	})
}

func (p *Pet) SetRegions(raw string) error {
	var rects []rectangle
	if len(raw) > 2048 {
		return errors.New("命中区域过大")
	}
	if err := json.Unmarshal([]byte(raw), &rects); err != nil {
		return err
	}
	if len(rects) > 8 {
		return errors.New("命中区域过多")
	}
	width, height := 480, 360

	for _, r := range rects {
		if r.X < 0 || r.Y < 0 || r.Width < 0 || r.Height < 0 || r.Width > width || r.Height > height || r.X > width-r.Width || r.Y > height-r.Height {
			return errors.New("命中区域越界")
		}
	}
	return desktop.Invoke("Pet.SetRegions", nil, rects)
}

func (p *Pet) Dock() error { return desktop.Invoke("Pet.Dock", nil) }

// Open resolves saved actions rather than accepting an arbitrary URL from the pet page.
func (p *Pet) Open(delivery, action string) error {
	hash := "#chat"
	if delivery != "" {
		db, err := p.store.DB()
		if err != nil {
			return err
		}
		var raw string
		if err = db.QueryRow("SELECT actions_json FROM deliveries WHERE delivery_id=? AND status NOT IN ('revoked','expired') AND expires_at>?", delivery, storage.Now()).Scan(&raw); err != nil {
			return errors.New("提示来源已失效")
		}
		var actions []struct {
			ID    string `json:"action_id"`
			Route struct {
				Type     string `json:"type"`
				Item     string `json:"item_id"`
				Session  string `json:"session_id"`
				Terminal string `json:"terminal_session_id"`
				Result   string `json:"result_ref"`
			} `json:"route"`
		}
		if err = json.Unmarshal([]byte(raw), &actions); err != nil {
			return err
		}
		found := false
		for _, a := range actions {
			if a.ID != action {
				continue
			}
			found = true
			switch a.Route.Type {
			case "chat":
				hash = "#chat/" + url.PathEscape(a.Route.Session)
			case "terminal":
				hash = "#terminal/session/" + url.PathEscape(a.Route.Terminal)
				if a.Route.Result != "" {
					hash += "?result=" + url.QueryEscape(a.Route.Result)
				}
			case "calendar":
				hash = "#calendar"
			case "attention":
				hash = "#notifications"
			case "planner", "planner_item", "task", "board":
				hash = "#board/" + url.PathEscape(a.Route.Item)
			default:
				return errors.New("不支持的提示入口")
			}
			break
		}
		if !found {
			return errors.New("提示操作已改变")
		}
	}
	if err := desktop.Invoke("Pet.Open", nil, hash); err != nil {
		return err
	}
	if delivery != "" {
		return p.work.RespondNotification(delivery, "seen", "pet-open:"+delivery+":"+action)
	}
	return nil
}
