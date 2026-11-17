package chat

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

type Attachment struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	MIME string `json:"mime"`
	Text string `json:"text,omitempty"`
	Data string `json:"data,omitempty"`
	Size int64  `json:"size,omitempty"`
}

func validateAttachments(items []Attachment) error {
	if len(items) > 8 {
		return errors.New("最多添加 8 个附件或引用")
	}
	total := 0
	ids := map[string]bool{}
	for _, item := range items {
		if item.ID == "" || len(item.ID) > 100 || ids[item.ID] || strings.TrimSpace(item.Name) == "" || len(item.Name) > 400 || strings.ContainsAny(item.Name, "\x00\r\n") || item.Size < 0 || item.Size > 20*1024*1024 {
			return errors.New("附件名称或标识无效")
		}
		ids[item.ID] = true
		if item.Data == "" {
			if item.MIME != "text/plain" || len(item.Text) > 128*1024 || !utf8.ValidString(item.Text) || strings.ContainsRune(item.Text, '\x00') {
				return errors.New("文本附件需为 128 KiB 以内的 UTF-8 文本")
			}
			total += len(item.Text)
		} else {
			if item.Text != "" || len(item.Data) > base64.StdEncoding.EncodedLen(20*1024*1024) {
				return errors.New("图片需小于 20 MiB")
			}
			data, err := base64.StdEncoding.DecodeString(item.Data)
			if err != nil || len(data) > 20*1024*1024 {
				return errors.New("图片数据无效")
			}
			detected := http.DetectContentType(data)
			if detected != item.MIME || item.MIME != "image/png" && item.MIME != "image/jpeg" && item.MIME != "image/gif" {
				return errors.New("仅支持 PNG、JPEG 或 GIF 图片，文件内容需与格式一致")
			}
			cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
			if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 24_000_000 {
				return errors.New("图片尺寸无效或超过 2400 万像素")
			}
			total += len(data)
		}
		if total > 40*1024*1024 {
			return errors.New("附件合计需小于 40 MiB")
		}
	}
	return nil
}

func (c *Chat) SubmitContext(id, raw, model, effort, command string) (SubmitReceipt, error) {
	if len(raw) > 64*1024*1024 {
		return SubmitReceipt{}, errors.New("消息及附件过大")
	}
	var request struct {
		Text        string       `json:"text"`
		Attachments []Attachment `json:"attachments"`
		EditOf      string       `json:"editOf"`
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return SubmitReceipt{}, err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return SubmitReceipt{}, errors.New("无效的消息")
	}
	if err := validateAttachments(request.Attachments); err != nil {
		return SubmitReceipt{}, err
	}
	if request.Text == "" && len(request.Attachments) > 0 {
		request.Text = "请查看附件。"
	}
	return c.submit(id, request.Text, model, effort, command, "prompt", "", request.EditOf, request.Attachments...)
}

func (c *Chat) Attachment(session, id, attachment string) (Attachment, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, err := c.find(session); err != nil {
		return Attachment{}, err
	}
	db, err := c.store.DB()
	if err != nil {
		return Attachment{}, err
	}
	var raw string
	if err = db.QueryRow("SELECT content_json FROM messages WHERE message_id=? AND session_id=?", id, session).Scan(&raw); err != nil {
		return Attachment{}, errors.New("附件消息不存在")
	}
	var message ChatMessage
	if err = json.Unmarshal([]byte(raw), &message); err != nil {
		return Attachment{}, err
	}
	for _, item := range message.Attachments {
		if item.ID == attachment {
			return item, nil
		}
	}
	return Attachment{}, errors.New("附件不存在")
}

func promptAttachments(text string, items []Attachment) string {
	for _, item := range items {
		if item.Data == "" {
			text += "\n\n[用户引用：" + item.Name + "]\n" + item.Text + "\n[引用结束]"
		}
	}
	return text
}
