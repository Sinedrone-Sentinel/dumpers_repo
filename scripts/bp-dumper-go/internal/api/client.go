package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/lookup"
	"github.com/Sinedrone-Sentinel/dumpers_repo/scripts/bp-dumper-go/internal/parse"
)

const (
	DefaultWebhookURL  = "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook"
	DefaultReleasesURL = "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases"
	DefaultDownloadURL = "https://github.com/Sinedrone-Sentinel/dumpers_repo/releases/latest/download/DumperApps.exe"
)

type UpdateRequiredError struct {
	Latest      string
	DownloadURL string
}

func (e *UpdateRequiredError) Error() string {
	return "dumper update required"
}

type Client struct {
	HTTP    *http.Client
	URL     string
	Version string
	Auth    string
	Lookup  *lookup.Data
}

func New(url, apiKey, version string, lu *lookup.Data) *Client {
	if url == "" {
		url = DefaultWebhookURL
	}
	return &Client{
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		URL:     url,
		Version: version,
		Auth:    apiKey,
		Lookup:  lu,
	}
}

func (c *Client) doJSON(method string, payload any) (int, map[string]any, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return 0, nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.URL, body)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Dumper-Version", c.Version)
	if c.Auth != "" {
		req.Header.Set("Authorization", "Bearer "+c.Auth)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	if m == nil {
		m = map[string]any{}
	}
	if res.StatusCode == 426 {
		latest, _ := m["latestDumperVersion"].(string)
		dl, _ := m["downloadUrl"].(string)
		if dl == "" {
			dl = DefaultDownloadURL
		}
		return res.StatusCode, m, &UpdateRequiredError{Latest: latest, DownloadURL: dl}
	}
	return res.StatusCode, m, nil
}

func (c *Client) SyncAcquired() ([]string, string, string, error) {
	status, body, err := c.doJSON(http.MethodGet, nil)
	if err != nil {
		return nil, "", "", err
	}
	if status != 200 {
		return nil, "", "", fmt.Errorf("HTTP %d", status)
	}
	success, _ := body["success"].(bool)
	if !success {
		return nil, "", "", fmt.Errorf("sync unsuccessful")
	}
	var bps []string
	if arr, ok := body["blueprints"].([]any); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok {
				bps = append(bps, s)
			}
		}
	}
	latest, _ := body["latestDumperVersion"].(string)
	dl, _ := body["downloadUrl"].(string)
	return bps, latest, dl, nil
}

func (c *Client) PostEvent(eventType string, fields map[string]any) error {
	payload := map[string]any{"type": eventType}
	for k, v := range fields {
		if v != nil {
			payload[k] = v
		}
	}
	status, _, err := c.doJSON(http.MethodPost, payload)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("HTTP %d", status)
	}
	return nil
}

func (c *Client) PostBlueprint(blueprintInput, contractDefinitionID string) (status int, duplicate bool, internalName string, errMsg string, err error) {
	postValue := blueprintInput
	local := c.Lookup.Resolve(blueprintInput, contractDefinitionID)
	if local.OK {
		postValue = local.InternalName
	}
	payload := map[string]any{
		"type":      "blueprint_received",
		"blueprint": postValue,
	}
	if contractDefinitionID != "" {
		payload["contractDefinitionId"] = contractDefinitionID
	}
	status, body, err := c.doJSON(http.MethodPost, payload)
	if err != nil {
		return status, false, "", "", err
	}
	if v, ok := body["blueprint"].(string); ok && v != "" {
		internalName = v
	} else if local.OK {
		internalName = local.InternalName
	}
	if d, ok := body["duplicate"].(bool); ok {
		duplicate = d
	}
	if status == 400 {
		e, _ := body["error"].(string)
		if e == "" {
			e = "Unknown blueprint"
		}
		errMsg = fmt.Sprintf(`%s (posted: "%s")`, e, postValue)
	} else if status >= 400 && status != 202 {
		e, _ := body["error"].(string)
		if e == "" {
			e = fmt.Sprintf("HTTP %d", status)
		}
		errMsg = fmt.Sprintf(`%s (posted: "%s")`, e, postValue)
	}
	return status, duplicate, internalName, errMsg, nil
}

func (c *Client) SyncActiveMissions(state *parse.WatcherState) error {
	missions := make([]map[string]string, 0, len(state.Active))
	for _, active := range state.Active {
		missions = append(missions, map[string]string{
			"missionGuid":          active.GUID,
			"contractDefinitionId": active.ContractDefinitionID,
			"debugName":            active.DebugName,
		})
	}
	return c.PostEvent("missions_snapshot", map[string]any{"missions": missions})
}

type PingController struct {
	mu              sync.Mutex
	paused          bool
	updateRequired  *UpdateRequiredError
}

func NewPingController() *PingController {
	return &PingController{paused: true}
}

func (p *PingController) Pause(_ string) {
	p.mu.Lock()
	p.paused = true
	p.mu.Unlock()
}

func (p *PingController) Resume(_ string) {
	p.mu.Lock()
	p.paused = false
	p.mu.Unlock()
}

func (p *PingController) IsPaused() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.paused
}

func (p *PingController) NoteUpdateRequired(err *UpdateRequiredError) {
	p.mu.Lock()
	p.updateRequired = err
	p.mu.Unlock()
}

func (p *PingController) TakeUpdateRequired() *UpdateRequiredError {
	p.mu.Lock()
	defer p.mu.Unlock()
	err := p.updateRequired
	p.updateRequired = nil
	return err
}

func StartSessionPingLoop(c *Client, stop <-chan struct{}, ping *PingController) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			if ping.IsPaused() {
				continue
			}
			if err := c.PostEvent("session_ping", nil); err != nil {
				if u, ok := err.(*UpdateRequiredError); ok {
					ping.NoteUpdateRequired(u)
					ping.Pause("update required")
					return
				}
			}
		}
	}
}

func IsNewerVersion(latest, current string) bool {
	lp := parseSemver(latest)
	cp := parseSemver(current)
	n := len(lp)
	if len(cp) < n {
		n = len(cp)
	}
	for i := 0; i < n; i++ {
		if lp[i] > cp[i] {
			return true
		}
		if lp[i] < cp[i] {
			return false
		}
	}
	return len(lp) > len(cp)
}

func parseSemver(v string) []int {
	var out []int
	cur := 0
	has := false
	for _, r := range v {
		if r >= '0' && r <= '9' {
			cur = cur*10 + int(r-'0')
			has = true
		} else if has {
			out = append(out, cur)
			cur = 0
			has = false
			if r != '.' {
				break
			}
		}
	}
	if has {
		out = append(out, cur)
	}
	return out
}
