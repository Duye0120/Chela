package main

import (
	"bytes"
	"embed"
	"image/color"
	"image/png"
	"io/fs"
	"log"
	"os"

	"github.com/Duye0120/Chela/native/internal/chat"
	"github.com/Duye0120/Chela/native/internal/pet"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/terminal"
	"github.com/Duye0120/Chela/native/internal/work"
	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

//go:embed all:dist
var files embed.FS

//go:embed frontend/src/assets/icons/Chela24Px.svg
var traySVG []byte

func main() {
	frontend, err := fs.Sub(files, "dist")
	if err != nil {
		log.Fatal(err)
	}
	mygo.SetFrontend(frontend)
	app := mygo.App
	app.SetName("Chela")
	if profile := os.Getenv("CHELA_SHELL_PROFILE"); profile != "" {
		app.SetPath(mygo.PathUserData, profile)
	}
	if !app.RequestSingleInstanceLock() {
		return
	}
	profile, err := app.Path(mygo.PathUserData)
	if err != nil {
		log.Fatal(err)
	}
	store := storage.New(profile)
	chats, closeChats := chat.New(profile, store)
	mygo.Bind(chats)
	workService := work.New(profile, store)
	mygo.Bind(workService)
	companion, startPet, stopPet := pet.New(store, workService)
	mygo.Bind(companion)
	terminals, closeTerminals := terminal.New(store)
	mygo.Bind(terminals)
	app.OnQuit(func() { closeTerminals(); closeChats() })
	var window *mygo.Window
	quitting := false
	app.OnBeforeQuit(func(*mygo.QuitEvent) { quitting = true; stopPet() })
	app.OnSecondInstance(func([]string, string) {
		if window != nil {
			if window.IsMinimized() {
				window.Restore()
			}
			window.Show()
			window.Focus()
		}
	})
	app.WhenReady(func() {
		if err := chats.Start(); err != nil {
			log.Print("启动 Chela 运行服务失败: ", err)
		}
		window = mygo.NewWindow(mygo.WindowOptions{
			Title: "Chela", URL: "/", Width: 1480, Height: 920, MinWidth: 720, MinHeight: 460,
			Frameless: true, StateKey: "main",
		})
		pet.GuardPage(window)
		startPet(window)
		var icon bytes.Buffer
		svg, iconErr := ui.ParseSVG(traySVG)
		if iconErr == nil {
			iconErr = png.Encode(&icon, svg.Image(32, 32, color.Black))
		}
		if iconErr == nil {
			tray, trayErr := mygo.NewTray(mygo.TrayOptions{ID: "chela", Icon: icon.Bytes(), ToolTip: "Chela · 关闭主窗口后继续运行", Menu: mygo.NewMenu([]*mygo.MenuItem{
				{Label: "打开 Chela", Click: func(*mygo.MenuItem, *mygo.Window) { window.Show(); window.Restore(); window.Focus() }},
				{Label: "显示桌宠", Click: func(*mygo.MenuItem, *mygo.Window) {
					go func() {
						if err := companion.SetHidden(false); err != nil {
							log.Print(err)
						}
					}()
				}},
				{Label: "隐藏桌宠", Click: func(*mygo.MenuItem, *mygo.Window) {
					go func() {
						if err := companion.SetHidden(true); err != nil {
							log.Print(err)
						}
					}()
				}},
				{Label: "退出 Chela", Role: mygo.RoleQuit},
			})})
			if trayErr == nil {
				window.OnClose(func(e *mygo.CloseEvent) {
					if !quitting {
						e.PreventDefault()
						window.Hide()
					}
				})
				app.OnWillQuit(func(*mygo.QuitEvent) { tray.Destroy() })
			} else {
				log.Print("系统托盘不可用: ", trayErr)
			}
		} else {
			log.Print("托盘图标不可用: ", iconErr)
		}
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
