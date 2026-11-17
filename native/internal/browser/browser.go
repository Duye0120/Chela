package browser

import (
	"encoding/json"
	"errors"
	"github.com/Duye0120/Chela/native/internal/desktop"
	"math"
	"net/url"
	"strings"
)

type Tab struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Title   string `json:"title"`
	Error   string `json:"error"`
	Loading bool   `json:"loading"`
	Back    bool   `json:"back"`
	Forward bool   `json:"forward"`
}
type layout struct {
	X, Y, Width, Height, ViewportWidth, ViewportHeight float64
	Visible                                            bool
}
type Browser struct{}

func New() *Browser { return &Browser{} }
func safeURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) > 8192 {
		return "", errors.New("地址过长")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Opaque != "" || u.User != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("请输入完整的 http 或 https 地址，不包含账号密码")
	}
	return u.String(), nil
}
func validLayout(r layout) bool {
	for _, v := range []float64{r.X, r.Y, r.Width, r.Height, r.ViewportWidth, r.ViewportHeight} {
		if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 20000 {
			return false
		}
	}
	return r.ViewportWidth > 0 && r.ViewportHeight > 0 && r.Width >= 1 && r.Height >= 1 && r.X+r.Width <= r.ViewportWidth+1 && r.Y+r.Height <= r.ViewportHeight+1
}

func (b *Browser) Create(id, raw string) (Tab, error) {
	if len(id) < 8 || len(id) > 100 {
		return Tab{}, errors.New("标签标识无效")
	}
	address := "about:blank"
	if raw != "" {
		var err error
		address, err = safeURL(raw)
		if err != nil {
			return Tab{}, err
		}
	}
	var tab Tab
	err := desktop.Invoke("Browser.Create", &tab, id, address)
	return tab, err
}
func (b *Browser) Snapshot() ([]Tab, error) {
	tabs := []Tab{}
	err := desktop.Invoke("Browser.Snapshot", &tabs)
	return tabs, err
}
func (b *Browser) page(id string) (*page, error) {
	var tab Tab
	if err := desktop.Invoke("Browser.Get", &tab, id); err != nil {
		return nil, err
	}
	return &page{id: id, address: tab.URL}, nil
}

type page struct{ id, address string }

func (p *page) URL() string { return p.address }
func (p *page) Eval(script string) (any, error) {
	var value any
	err := desktop.Invoke("Browser.Eval", &value, p.id, script)
	return value, err
}
func (b *Browser) Action(id, action, raw string) error {
	switch action {
	case "navigate":
		address, err := safeURL(raw)
		if err != nil {
			return err
		}
		raw = address
	case "back", "forward", "reload", "external":
	default:
		return errors.New("不支持的浏览器操作")
	}
	return desktop.Invoke("Browser.Action", nil, id, action, raw)
}
func (b *Browser) Layout(id, raw string) error {
	var r layout
	if id != "" {
		if len(raw) > 2048 {
			return errors.New("预览区域过大")
		}
		if err := json.Unmarshal([]byte(raw), &r); err != nil {
			return err
		}
		if !validLayout(r) {
			return errors.New("预览区域无效")
		}
	}
	return desktop.Invoke("Browser.Layout", nil, id, r)
}
func (b *Browser) Close(id string) error { return desktop.Invoke("Browser.Close", nil, id) }
