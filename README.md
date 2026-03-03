# android-sim-mcp

MCP server for driving the Android Emulator in agentic code→build→test feedback loops.
The Android counterpart to ios-sim-mcp.

## Prerequisites

- Android Studio installed
- `adb` on your PATH (`brew install android-platform-tools` or via Android Studio)
- At least one AVD created in Android Studio
- `ANDROID_HOME` set (usually `~/Library/Android/sdk`)

## Setup
```bash
npm install
npm run build
```

## Add to Claude Code
```bash
claude mcp add android-sim -- node /path/to/android-sim-mcp/dist/index.js
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_emulators` | List AVDs and running state |
| `boot_emulator` | Boot an AVD by name |
| `screenshot` | Capture screen (returns image) |
| `tap` | Tap at x,y |
| `swipe` | Swipe between two points |
| `type_text` | Type into focused input |
| `press_key` | Press keycode (home, back, enter, etc.) |
| `open_url` | Open URL or deep link |
| `install_apk` | Install APK |
| `launch_app` | Launch by package + activity with optional extras |
| `terminate_app` | Force-stop app |
| `clear_app_data` | Clear app state |
| `build_app` | Gradle build, returns errors |
| `build_and_run` | Build + install + launch in one step |
| `run_tests` | Run unit or instrumented tests |
| `get_accessibility_tree` | UI hierarchy XML via uiautomator |
| `tap_by_resource_id` | Tap element by resource ID (more reliable than coordinates) |
| `inject_file` | Push file to device via adb push |
| `get_app_logs` | Logcat output filtered by package/tag |
| `set_permission` | Grant/revoke runtime permissions |
| `reset_emulator` | Kill emulator (restarts clean) |

## Debug Injection Pattern
```kotlin
// In your Application or Activity (debug builds only)
if (BuildConfig.DEBUG) {
    intent.getStringExtra("MOCK_AUDIO_PATH")?.let { path ->
        // Use injected file instead of mic
    }
}
```

Then trigger via `launch_app` with extras: `[{ key: "MOCK_AUDIO_PATH", value: "/sdcard/test.m4a" }]`