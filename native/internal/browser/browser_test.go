package browser

import (
	"math"
	"testing"
)

func TestPreviewBoundaries(t *testing.T) {
	for _, raw := range []string{"javascript:alert(1)", "file:///C:/private.txt", "data:text/html,hello", "https://user:pass@example.com", "http://", "/settings", "null"} {
		if _, err := safeURL(raw); err == nil {
			t.Fatalf("unsafe preview URL accepted: %q", raw)
		}
	}
	for _, raw := range []string{"http://127.0.0.1:5173/settings", "https://example.com:443/path?x=1#part"} {
		if _, err := safeURL(raw); err != nil {
			t.Fatal(raw, err)
		}
	}
	good := layout{X: 900, Y: 130, Width: 480, Height: 720, ViewportWidth: 1468, ViewportHeight: 914, Visible: true}
	if !validLayout(good) {
		t.Fatal("valid preview bounds rejected")
	}
	bad := good
	bad.X = 1400
	if validLayout(bad) {
		t.Fatal("overflowing native view accepted")
	}
	bad = good
	bad.Width = math.NaN()
	if validLayout(bad) {
		t.Fatal("NaN view bounds accepted")
	}
}
