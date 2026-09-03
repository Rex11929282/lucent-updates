// 讀取 Windows「系統媒體控制(SMTC)」所有播放來源。
// 常駐 PowerShell 迴圈，每 0.6 秒輸出所有 session；上層目前仍只挑網易雲。
const { spawn } = require('child_process')
const fs = require('fs')
const { normalizeMediaSessions } = require('../shared/mediaSession.cjs')

const SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
Function Await($op, $t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$ppid = 0
if ($args.Count -ge 1) { $ppid = [int]$args[0] }
$thumbCache = @{}
Function ReadThumbnail($reference, $key) {
  if (-not $reference) { return '' }
  if ($thumbCache.ContainsKey($key)) { return $thumbCache[$key] }
  $result = ''
  try {
    $stream = Await ($reference.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    if ($stream -and $stream.Size -gt 0 -and $stream.Size -le 1572864) {
      $reader = [Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
      $loaded = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
      if ($loaded -gt 0) {
        $bytes = New-Object byte[] ([int]$loaded)
        $reader.ReadBytes($bytes)
        $mime = if ($stream.ContentType) { $stream.ContentType } else { 'application/octet-stream' }
        $result = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
      }
      $reader.Dispose()
    }
    if ($stream) { $stream.Dispose() }
  } catch {}
  if ($thumbCache.Count -ge 64) { $thumbCache.Clear() }
  $thumbCache[$key] = $result
  return $result
}
while ($true) {
  if ($ppid -gt 0 -and -not (Get-Process -Id $ppid -ErrorAction SilentlyContinue)) { break }
  try {
    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $sessions = $mgr.GetSessions()
    $arr = @()
    foreach ($s in $sessions) {
      try {
        $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $tl = $s.GetTimelineProperties(); $pb = $s.GetPlaybackInfo()
        $sourceAppId = $s.SourceAppUserModelId
        $thumbKey = $sourceAppId + '|' + $p.Title + '|' + $p.Artist + '|' + $p.AlbumTitle
        $arr += @{
          sessionId=$sourceAppId
          sourceAppId=$sourceAppId
          title=$p.Title
          artist=$p.Artist
          albumArtist=$p.AlbumArtist
          albumTitle=$p.AlbumTitle
          thumbnail=(ReadThumbnail $p.Thumbnail $thumbKey)
          position=$tl.Position.TotalSeconds
          duration=$tl.EndTime.TotalSeconds
          playbackStatus=$pb.PlaybackStatus.ToString()
        }
      } catch {}
    }
    $nz = ''
    try {
      $t = Get-Process -Name cloudmusic -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Contains(' - ') } | Select-Object -First 1 -ExpandProperty MainWindowTitle
      if ($t) { $nz = $t }
    } catch {}
    Write-Output (@{ sessions = @($arr); netease = $nz } | ConvertTo-Json -Compress -Depth 4)
  } catch { Write-Output '{"sessions":[]}' }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 600
}
`

let proc = null

function start(onData, scriptPath) {
  stop()
  try { fs.writeFileSync(scriptPath, SCRIPT, 'utf-8') } catch {}
  proc = spawn('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, String(process.pid)], { windowsHide: true })
  let buf = ''
  proc.stdout.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try {
        const j = JSON.parse(line)
        let s = j && j.sessions
        s = Array.isArray(s) ? s : (s ? [s] : [])
        onData({ sessions: normalizeMediaSessions(s), netease: (j && j.netease) || '' })
      } catch {}
    }
  })
  proc.on('error', () => {})
  proc.on('close', () => { proc = null })
}

function stop() {
  if (proc) { try { proc.kill() } catch {} ; proc = null }
}

module.exports = { start, stop }
