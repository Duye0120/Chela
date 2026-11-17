package chat

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/Duye0120/Chela/native/internal/network"
)

func (c *Chat) NetworkSettings() (network.Config, error) { return c.network.Settings() }
func (c *Chat) SetNetworkSettings(raw string) error {
	if len(raw) > 4096 {
		return errors.New("代理配置过长")
	}
	var cfg network.Config
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return err
	}
	return c.network.Save(cfg)
}
func (c *Chat) TestNetwork() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	request, _ := http.NewRequestWithContext(ctx, http.MethodHead, "https://api.github.com", nil)
	start := time.Now()
	response, err := c.network.Client().Do(request)
	if err != nil {
		return 0, errors.New("代理连接失败，请检查地址或网络")
	}
	defer response.Body.Close()
	if response.StatusCode >= 400 {
		return 0, errors.New("网络测试返回错误状态")
	}
	return time.Since(start).Milliseconds(), nil
}
