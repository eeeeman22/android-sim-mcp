import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

const server = new Server(
  { name: "android-sim-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// --- Helpers ---

function adb(...args: string[]): string {
  return execSync(`adb ${args.join(" ")}`, { encoding: "utf8" });
}

async function adbAsync(...args: string[]): Promise<string> {
  const { stdout } = await execAsync(`adb ${args.join(" ")}`);
  return stdout;
}

function getAndroidHome(): string {
  return (
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    path.join(os.homedir(), "Library/Android/sdk")
  );
}

function emulator(...args: string[]): string {
  const emulatorBin = path.join(getAndroidHome(), "emulator", "emulator");
  return execSync(`"${emulatorBin}" ${args.join(" ")}`, { encoding: "utf8" });
}

function getBootedEmulatorSerial(): string {
  const output = adb("devices");
  const lines = output.split("\n").filter(l => l.includes("emulator") && l.includes("device"));
  if (lines.length === 0) throw new Error("No booted emulator found. Start one first via Android Studio or avdmanager.");
  return lines[0].split("\t")[0].trim();
}

function gradle(projectPath: string, ...args: string[]): string {
  const gradlew = path.join(projectPath, "gradlew");
  const cmd = fs.existsSync(gradlew)
    ? `"${gradlew}" ${args.join(" ")}`
    : `gradle ${args.join(" ")}`;
  return execSync(cmd, { cwd: projectPath, encoding: "utf8" });
}

async function gradleAsync(projectPath: string, ...args: string[]): Promise<string> {
  const gradlew = path.join(projectPath, "gradlew");
  const cmd = fs.existsSync(gradlew)
    ? `"${gradlew}" ${args.join(" ")}`
    : `gradle ${args.join(" ")}`;
  const { stdout } = await execAsync(cmd, { cwd: projectPath });
  return stdout;
}

// --- Tool Definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_emulators",
      description: "List all available Android Virtual Devices (AVDs) and whether they are currently running.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "boot_emulator",
      description: "Boot an Android emulator by AVD name.",
      inputSchema: {
        type: "object",
        properties: {
          avd_name: { type: "string", description: "AVD name as shown in list_emulators" },
          headless: {
            type: "boolean",
            description: "Run without a visible window (-no-window). Useful for CI.",
            default: false,
          },
        },
        required: ["avd_name"],
      },
    },
    {
      name: "screenshot",
      description: "Take a screenshot of the booted emulator. Returns a base64-encoded PNG.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "tap",
      description: "Tap at a specific coordinate on the emulator screen.",
      inputSchema: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
        },
        required: ["x", "y"],
      },
    },
    {
      name: "swipe",
      description: "Swipe from one coordinate to another.",
      inputSchema: {
        type: "object",
        properties: {
          x1: { type: "number" },
          y1: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
          duration_ms: { type: "number", description: "Swipe duration in milliseconds", default: 300 },
        },
        required: ["x1", "y1", "x2", "y2"],
      },
    },
    {
      name: "type_text",
      description: "Type text into the currently focused input on the emulator.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type (spaces must be encoded as %s)" },
        },
        required: ["text"],
      },
    },
    {
      name: "press_key",
      description: "Press a hardware or soft key by Android keycode name.",
      inputSchema: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Android keycode, e.g. KEYCODE_HOME, KEYCODE_BACK, KEYCODE_ENTER, KEYCODE_DPAD_UP",
          },
        },
        required: ["key"],
      },
    },
    {
      name: "open_url",
      description: "Open a URL or deep link in the emulator.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL or deep link to open" },
        },
        required: ["url"],
      },
    },
    {
      name: "install_apk",
      description: "Install an APK on the booted emulator.",
      inputSchema: {
        type: "object",
        properties: {
          apk_path: { type: "string", description: "Absolute path to the .apk file" },
        },
        required: ["apk_path"],
      },
    },
    {
      name: "launch_app",
      description: "Launch an installed app by package and activity name.",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string", description: "App package name, e.g. com.example.myapp" },
          activity: {
            type: "string",
            description: "Activity to launch, e.g. .MainActivity. Defaults to the main launcher activity.",
            default: ".MainActivity",
          },
          extras: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
            },
            description: "Optional intent extras passed as --es key value pairs",
          },
        },
        required: ["package"],
      },
    },
    {
      name: "terminate_app",
      description: "Force-stop a running app by package name.",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string", description: "App package name" },
        },
        required: ["package"],
      },
    },
    {
      name: "clear_app_data",
      description: "Clear all data for an app (equivalent to uninstall+reinstall for state reset).",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string", description: "App package name" },
        },
        required: ["package"],
      },
    },
    {
      name: "build_app",
      description: "Build an Android project using Gradle. Returns build output and success/failure.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the Android project root (where gradlew lives)" },
          variant: {
            type: "string",
            description: "Build variant, e.g. debug, release",
            default: "debug",
          },
        },
        required: ["project_path"],
      },
    },
    {
      name: "build_and_run",
      description: "Build the Android project, install the APK, and launch the app on the booted emulator.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the Android project root" },
          package: { type: "string", description: "App package name" },
          activity: { type: "string", description: "Activity to launch", default: ".MainActivity" },
          variant: { type: "string", description: "Build variant", default: "debug" },
          extras: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
            },
            description: "Optional intent extras for debug injection",
          },
        },
        required: ["project_path", "package"],
      },
    },
    {
      name: "run_tests",
      description: "Run instrumented tests or unit tests for the Android project.",
      inputSchema: {
        type: "object",
        properties: {
          project_path: { type: "string", description: "Absolute path to the Android project root" },
          test_type: {
            type: "string",
            enum: ["unit", "instrumented"],
            description: "Unit tests run on JVM, instrumented tests run on the emulator",
            default: "unit",
          },
          module: {
            type: "string",
            description: "Gradle module to test, e.g. :app. Defaults to all modules.",
          },
        },
        required: ["project_path"],
      },
    },
    {
      name: "get_accessibility_tree",
      description: "Dump the UI hierarchy of the current screen as XML via uiautomator. Useful for finding element resource IDs to interact with.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "tap_by_resource_id",
      description: "Tap an element by its resource ID (from get_accessibility_tree). More reliable than coordinate tapping.",
      inputSchema: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description: "Resource ID, e.g. com.example.app:id/submit_button",
          },
        },
        required: ["resource_id"],
      },
    },
    {
      name: "inject_file",
      description: "Push a file from the host to the emulator's file system. Useful for injecting mock audio or test data.",
      inputSchema: {
        type: "object",
        properties: {
          local_path: { type: "string", description: "Absolute path to the file on your Mac" },
          device_path: {
            type: "string",
            description: "Destination path on the device, e.g. /sdcard/Download/test.m4a",
          },
        },
        required: ["local_path", "device_path"],
      },
    },
    {
      name: "get_app_logs",
      description: "Get recent logcat output, optionally filtered by package name or tag.",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string", description: "Filter to this package's PID (optional)" },
          tag: { type: "string", description: "Filter by log tag (optional)" },
          lines: { type: "number", description: "Number of recent lines to return", default: 50 },
          level: {
            type: "string",
            enum: ["V", "D", "I", "W", "E"],
            description: "Minimum log level (Verbose/Debug/Info/Warn/Error)",
            default: "D",
          },
        },
      },
    },
    {
      name: "set_permission",
      description: "Grant or revoke a runtime permission for an app.",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string" },
          permission: {
            type: "string",
            description: "Android permission, e.g. android.permission.RECORD_AUDIO",
          },
          action: { type: "string", enum: ["grant", "revoke"] },
        },
        required: ["package", "permission", "action"],
      },
    },
    {
      name: "reset_emulator",
      description: "Wipe the booted emulator back to factory state (cold boot wipe).",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

// --- Tool Handlers ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_emulators": {
        const androidHome = getAndroidHome();
        const avdmanager = path.join(androidHome, "cmdline-tools", "latest", "bin", "avdmanager");
        const { stdout: avdList } = await execAsync(`"${avdmanager}" list avd 2>/dev/null || avdmanager list avd`);

        // Get running emulators
        const devicesOutput = adb("devices");
        const runningSerials = devicesOutput
          .split("\n")
          .filter(l => l.includes("emulator") && l.includes("device"))
          .map(l => l.split("\t")[0].trim());

        // Parse AVD names
        const avdNames = [...avdList.matchAll(/Name:\s+(.+)/g)].map(m => m[1].trim());

        const result = avdNames.map(name => ({
          name,
          running: runningSerials.some(s => {
            try {
              const avdName = execSync(`adb -s ${s} emu avd name 2>/dev/null`, { encoding: "utf8" }).trim();
              return avdName.includes(name);
            } catch {
              return false;
            }
          }),
        }));

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "boot_emulator": {
        const { avd_name, headless = false } = args as any;
        const androidHome = getAndroidHome();
        const emulatorBin = path.join(androidHome, "emulator", "emulator");
        const flags = headless ? "-no-window -no-audio" : "";
        exec(`"${emulatorBin}" -avd "${avd_name}" ${flags}`);
        // Wait for boot
        execSync("adb wait-for-device", { encoding: "utf8" });
        execSync(
          `adb shell while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done`,
          { encoding: "utf8" }
        );
        return { content: [{ type: "text", text: `Emulator ${avd_name} booted.` }] };
      }

      case "screenshot": {
        const tmpDevice = "/sdcard/mcp-screenshot.png";
        const tmpLocal = path.join(os.tmpdir(), `android-screenshot-${Date.now()}.png`);
        adb("shell", "screencap", "-p", tmpDevice);
        adb("pull", tmpDevice, tmpLocal);
        adb("shell", "rm", tmpDevice);
        const imgData = fs.readFileSync(tmpLocal).toString("base64");
        fs.unlinkSync(tmpLocal);
        return {
          content: [
            { type: "text", text: "Screenshot captured." },
            { type: "image", data: imgData, mimeType: "image/png" },
          ],
        };
      }

      case "tap": {
        const { x, y } = args as { x: number; y: number };
        adb("shell", "input", "tap", `${x}`, `${y}`);
        return { content: [{ type: "text", text: `Tapped at (${x}, ${y})` }] };
      }

      case "swipe": {
        const { x1, y1, x2, y2, duration_ms = 300 } = args as any;
        adb("shell", "input", "swipe", `${x1}`, `${y1}`, `${x2}`, `${y2}`, `${duration_ms}`);
        return { content: [{ type: "text", text: `Swiped (${x1},${y1}) → (${x2},${y2})` }] };
      }

      case "type_text": {
        // Encode spaces as %s for adb input text
        const encoded = (args!.text as string).replace(/ /g, "%s");
        adb("shell", "input", "text", `"${encoded}"`);
        return { content: [{ type: "text", text: `Typed: ${args!.text}` }] };
      }

      case "press_key": {
        adb("shell", "input", "keyevent", args!.key as string);
        return { content: [{ type: "text", text: `Pressed key: ${args!.key}` }] };
      }

      case "open_url": {
        adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"${args!.url}"`);
        return { content: [{ type: "text", text: `Opened: ${args!.url}` }] };
      }

      case "install_apk": {
        const output = adb("install", "-r", args!.apk_path as string);
        return { content: [{ type: "text", text: output }] };
      }

      case "launch_app": {
        const { package: pkg, activity = ".MainActivity", extras = [] } = args as any;
        const extraFlags = extras
          .map((e: { key: string; value: string }) => `--es "${e.key}" "${e.value}"`)
          .join(" ");
        const output = adb(
          "shell", "am", "start", "-n", `${pkg}/${activity}`, extraFlags
        );
        return { content: [{ type: "text", text: output }] };
      }

      case "terminate_app": {
        adb("shell", "am", "force-stop", args!.package as string);
        return { content: [{ type: "text", text: `Stopped ${args!.package}` }] };
      }

      case "clear_app_data": {
        adb("shell", "pm", "clear", args!.package as string);
        return { content: [{ type: "text", text: `Cleared data for ${args!.package}` }] };
      }

      case "build_app": {
        const { project_path, variant = "debug" } = args as any;
        const task = `assemble${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
        const { stdout } = await execAsync(`./gradlew ${task} 2>&1 | tail -60`, {
          cwd: project_path,
        });
        const success = stdout.includes("BUILD SUCCESSFUL");
        return {
          content: [{ type: "text", text: `Build ${success ? "SUCCESSFUL" : "FAILED"}\n\n${stdout}` }],
        };
      }

      case "build_and_run": {
        const { project_path, package: pkg, activity = ".MainActivity", variant = "debug", extras = [] } = args as any;

        // Build
        const task = `assemble${variant.charAt(0).toUpperCase()}${variant.slice(1)}`;
        const { stdout: buildOutput } = await execAsync(`./gradlew ${task} 2>&1 | tail -80`, {
          cwd: project_path,
        });
        const success = buildOutput.includes("BUILD SUCCESSFUL");

        if (!success) {
          return { content: [{ type: "text", text: `Build FAILED:\n\n${buildOutput}` }] };
        }

        // Find APK
        const apkDir = path.join(project_path, "app", "build", "outputs", "apk", variant);
        const apkFiles = fs.readdirSync(apkDir).filter(f => f.endsWith(".apk"));
        if (apkFiles.length === 0) throw new Error(`No APK found in ${apkDir}`);
        const apkPath = path.join(apkDir, apkFiles[0]);

        // Install
        adb("install", "-r", apkPath);

        // Launch
        const extraFlags = extras
          .map((e: { key: string; value: string }) => `--es "${e.key}" "${e.value}"`)
          .join(" ");
        adb("shell", "am", "start", "-n", `${pkg}/${activity}`, extraFlags);

        return {
          content: [{ type: "text", text: `Build SUCCESSFUL. Installed and launched ${pkg}.\n\n${buildOutput}` }],
        };
      }

      case "run_tests": {
        const { project_path, test_type = "unit", module } = args as any;
        const modulePrefix = module ? `${module}:` : "";
        const task = test_type === "instrumented"
          ? `${modulePrefix}connectedDebugAndroidTest`
          : `${modulePrefix}test`;
        const { stdout } = await execAsync(`./gradlew ${task} 2>&1 | tail -100`, {
          cwd: project_path,
        });
        const success = stdout.includes("BUILD SUCCESSFUL");
        return {
          content: [{ type: "text", text: `Tests ${success ? "PASSED" : "FAILED"}\n\n${stdout}` }],
        };
      }

      case "get_accessibility_tree": {
        const tmpDevice = "/sdcard/mcp-uidump.xml";
        const tmpLocal = path.join(os.tmpdir(), `android-ui-${Date.now()}.xml`);
        adb("shell", "uiautomator", "dump", tmpDevice);
        adb("pull", tmpDevice, tmpLocal);
        adb("shell", "rm", tmpDevice);
        const xml = fs.readFileSync(tmpLocal, "utf8");
        fs.unlinkSync(tmpLocal);
        return { content: [{ type: "text", text: xml }] };
      }

      case "tap_by_resource_id": {
        // Dump UI, find bounds of element, tap center
        const tmpDevice = "/sdcard/mcp-uidump.xml";
        const tmpLocal = path.join(os.tmpdir(), `android-ui-${Date.now()}.xml`);
        adb("shell", "uiautomator", "dump", tmpDevice);
        adb("pull", tmpDevice, tmpLocal);
        adb("shell", "rm", tmpDevice);
        const xml = fs.readFileSync(tmpLocal, "utf8");
        fs.unlinkSync(tmpLocal);

        const resourceId = args!.resource_id as string;
        const match = xml.match(
          new RegExp(`resource-id="${resourceId}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)
        );
        if (!match) throw new Error(`Element with resource-id "${resourceId}" not found on screen.`);

        const x = Math.round((parseInt(match[1]) + parseInt(match[3])) / 2);
        const y = Math.round((parseInt(match[2]) + parseInt(match[4])) / 2);
        adb("shell", "input", "tap", `${x}`, `${y}`);

        return { content: [{ type: "text", text: `Tapped "${resourceId}" at (${x}, ${y})` }] };
      }

      case "inject_file": {
        const { local_path, device_path } = args as any;
        adb("push", local_path, device_path);
        return { content: [{ type: "text", text: `File pushed to ${device_path}` }] };
      }

      case "get_app_logs": {
        const { package: pkg, tag, lines = 50, level = "D" } = args as any;
        let filter = "*:" + level;
        if (tag) filter = `${tag}:${level} *:S`;

        let pidFilter = "";
        if (pkg) {
          try {
            const pid = adb("shell", "pidof", pkg).trim();
            if (pid) pidFilter = `--pid=${pid}`;
          } catch { /* app may not be running */ }
        }

        const { stdout } = await execAsync(
          `adb logcat -d ${pidFilter} -v brief "${filter}" 2>/dev/null | tail -${lines}`
        );
        return { content: [{ type: "text", text: stdout }] };
      }

      case "set_permission": {
        const { package: pkg, permission, action } = args as any;
        adb("shell", "pm", action, pkg, permission);
        return { content: [{ type: "text", text: `${action}ed ${permission} for ${pkg}` }] };
      }

      case "reset_emulator": {
        const serial = getBootedEmulatorSerial();
        adb("-s", serial, "emu", "kill");
        return {
          content: [{ type: "text", text: `Emulator killed. Reboot with boot_emulator and it will start fresh.` }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("android-sim-mcp running");