package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/Duye0120/Chela/native/internal/maintenance"
)

func run() error {
	if len(os.Args) < 2 {
		return errors.New("用法: chela-data backup|verify|preview|restore --source <目录> [--out <新目录>] [--current <当前资料目录>]")
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ContinueOnError)
	source := flags.String("source", "", "资料目录；verify/restore 时为备份目录")
	output := flags.String("out", "", "尚不存在的新目录")
	current := flags.String("current", "", "当前资料目录，用于合并删除/遗忘登记")
	if err := flags.Parse(os.Args[2:]); err != nil {
		return err
	}
	if *source == "" || flags.NArg() != 0 {
		return errors.New("需要明确提供 --source 目录")
	}
	if os.Args[1] != "verify" && *output == "" {
		return errors.New("需要明确提供 --out 新目录")
	}
	var result any
	var err error
	switch os.Args[1] {
	case "backup":
		result, err = maintenance.Backup(*source, *output)
	case "verify":
		result, err = maintenance.Verify(*source)
	case "preview":
		result, err = maintenance.Preview(*source, *output)
	case "restore":
		result, err = maintenance.Restore(*source, *current, *output)
	default:
		return errors.New("不支持的资料操作")
	}
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result)
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
