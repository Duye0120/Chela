// Chela's backend is supervised by Electron and exposes no listening port.
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"github.com/Duye0120/Chela/native/internal/browser"
	"github.com/Duye0120/Chela/native/internal/chat"
	"github.com/Duye0120/Chela/native/internal/desktop"
	"github.com/Duye0120/Chela/native/internal/pet"
	"github.com/Duye0120/Chela/native/internal/storage"
	"github.com/Duye0120/Chela/native/internal/terminal"
	"github.com/Duye0120/Chela/native/internal/work"
)

func main() {
	profile := os.Getenv("CHELA_SHELL_PROFILE")
	if profile == "" {
		log.Fatal("请通过 Electron 启动 Chela 后端")
	}
	if err := os.MkdirAll(filepath.Join(profile, "logs"), 0700); err != nil {
		log.Fatal(err)
	}
	file, err := os.OpenFile(filepath.Join(profile, "logs", "host.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()
	log.SetOutput(file)
	bridge := desktop.New(os.Stdout)
	store := storage.New(profile)
	defer store.Close()
	chats, closeChats := chat.New(profile, store)
	defer closeChats()
	workService := work.New(profile, store)
	terminals, closeTerminals := terminal.New(store)
	defer closeTerminals()
	services := map[string]any{"Chat": chats, "Work": workService, "Terminal": terminals, "Browser": browser.New(), "Pet": pet.New(store, workService)}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ready := make(chan struct{})
	var startupErr error
	go func() {
		startupErr = chats.Start()
		if startupErr != nil {
			log.Print(startupErr)
		}
		close(ready)
	}()
	err = bridge.Serve(ctx, os.Stdin, func(ctx context.Context, method string, args []json.RawMessage) (any, error) {
		select {
		case <-ready:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		if startupErr != nil {
			return nil, startupErr
		}
		return desktop.Dispatch(ctx, services, method, args)
	})
	cancel()
	<-ready
	if err != nil {
		log.Print("桌面通信断开: ", err)
	}
}
