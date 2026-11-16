package pet

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"sync/atomic"
	"time"

	"github.com/Duye0120/Chela/native/internal/companion"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/work"
	"github.com/egoist/mygo"
)

type Pet struct {
	store        *storage.Store
	work         *work.Work
	window, main *mygo.Window
	locked       atomic.Bool
	quitting     atomic.Bool
	off          []func()
}

func New(store *storage.Store, work *work.Work) (*Pet, func(*mygo.Window), func()) {
	p := &Pet{store: store, work: work}
	return p, p.start, p.stop
}

func GuardPage(w *mygo.Window) {
	page := w.Page()
	page.SetWindowOpenHandler(func(mygo.WindowOpenRequest) *mygo.WindowOptions { return nil })
	page.OnWillNavigate(func(event *mygo.NavigateEvent) {
		current, e := url.Parse(page.URL())
		next, err := url.Parse(event.URL)
		if e != nil || err != nil || current.Scheme != next.Scheme || current.Host != next.Host {
			event.PreventDefault()
		}
	})
}

func (p *Pet) start(main *mygo.Window) {
	p.main = main
	area := mygo.Screen.PrimaryDisplay().WorkArea
	p.window = mygo.NewWindow(mygo.WindowOptions{Title: "Chela · 陪伴", URL: "/?pet=1", Width: 360, Height: 360, X: area.X + area.Width - 380, Y: area.Y + area.Height - 380, Hidden: true, Frameless: true, Transparent: true, AlwaysOnTop: true, SkipTaskbar: true, DisableResize: true, DisableMaximize: true, DisableMinimize: true, DisableShadow: true, StateKey: "pet"})
	GuardPage(p.window)
	p.window.SetInputRegion([]mygo.Rectangle{})
	p.window.OnClose(func(e *mygo.CloseEvent) {
		if !p.quitting.Load() {
			e.PreventDefault()
			go func() {
				if err := p.SetHidden(true); err != nil {
					log.Print("隐藏桌宠失败: ", err)
				}
			}()
		}
	})
	p.off = append(p.off, mygo.Power.OnLockScreen(func() { p.locked.Store(true); p.window.Hide() }), mygo.Power.OnUnlockScreen(func() { p.locked.Store(false) }), mygo.Screen.OnDisplaysChanged(func() { p.clamp(false) }))
	p.clamp(false)
}

func (p *Pet) stop() {
	p.quitting.Store(true)
	for _, off := range p.off {
		off()
	}
}

type Snapshot struct {
	State        string                  `json:"state"`
	Side         string                  `json:"side"`
	Emotion      string                  `json:"emotion"`
	Motion       bool                    `json:"motion"`
	Presentation *companion.Presentation `json:"presentation"`
}

func (p *Pet) presence() companion.Presence {
	locked, fullscreen := systemPresence()
	busy := false
	if p.main != nil && p.window != nil {
		busy = p.main.IsFocused() && !p.window.IsFocused() && mygo.Power.IdleTime() < 3*time.Second
	}
	return companion.Presence{Locked: locked || p.locked.Load(), Fullscreen: fullscreen, Busy: busy}
}

func (p *Pet) Snapshot() (Snapshot, error) {
	result := Snapshot{State: "hidden", Emotion: "neutral"}
	if p.window == nil || p.quitting.Load() {
		return result, nil
	}
	assistant, err := p.store.Identity()
	if err != nil {
		return result, err
	}
	presence := p.presence()
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
	bounds := p.window.Bounds()
	area := mygo.Screen.DisplayMatching(bounds).WorkArea
	result.Side = "right"
	if bounds.X+bounds.Width/2 < area.X+area.Width/2 {
		result.Side = "left"
	}
	if result.State == "idle" && !p.window.IsFocused() && (bounds.X <= area.X+2 || bounds.X+bounds.Width >= area.X+area.Width-2) {
		result.State = "peeking"
	}
	if presence.Locked || cfg.PetHidden || (presence.Fullscreen && result.Presentation == nil) {
		result.State = "hidden"
		p.window.Hide()
	} else if !p.window.IsVisible() {
		p.window.ShowInactive()
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
	if err == nil && p.window != nil {
		if hidden {
			p.window.Hide()
		} else {
			p.clamp(false)
		}
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
	var rects []mygo.Rectangle
	if len(raw) > 2048 {
		return errors.New("命中区域过大")
	}
	if err := json.Unmarshal([]byte(raw), &rects); err != nil {
		return err
	}
	if len(rects) > 8 {
		return errors.New("命中区域过多")
	}
	for _, r := range rects {
		if r.X < 0 || r.Y < 0 || r.Width < 0 || r.Height < 0 || r.X+r.Width > 360 || r.Y+r.Height > 360 {
			return errors.New("命中区域越界")
		}
	}
	if p.window != nil {
		p.window.SetInputRegion(rects)
	}
	return nil
}

func (p *Pet) Dock() { p.clamp(true) }
func (p *Pet) clamp(dock bool) {
	if p.window == nil {
		return
	}
	r := p.window.Bounds()
	area := mygo.Screen.DisplayMatching(r).WorkArea
	x := max(area.X, min(r.X, area.X+area.Width-r.Width))
	y := max(area.Y, min(r.Y, area.Y+area.Height-r.Height))
	if dock {
		if r.X+r.Width/2 < area.X+area.Width/2 {
			x = area.X
		} else {
			x = max(area.X, area.X+area.Width-r.Width)
		}
	}
	if x != r.X || y != r.Y {
		p.window.SetPosition(x, y)
	}
}

// Open resolves saved actions rather than accepting an arbitrary URL from the pet page.
func (p *Pet) Open(delivery, action string) error {
	if p.main == nil {
		return errors.New("主窗口尚未就绪")
	}
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
	encoded, _ := json.Marshal(hash)
	if _, err := p.main.Page().Eval("location.hash=" + string(encoded)); err != nil {
		return err
	}
	p.main.Show()
	if p.main.IsMinimized() {
		p.main.Restore()
	}
	p.main.Focus()
	if delivery != "" {
		return p.work.RespondNotification(delivery, "seen", "pet-open:"+delivery+":"+action)
	}
	return nil
}
