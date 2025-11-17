# SeerDB Executable Distribution

This guide explains how to build and distribute the standalone SeerDB executable.

## Building the Executable

```bash
# Build the standalone executable
bun run build:exe
```

This will create:
- `dist/seerdb` - The compiled executable (59MB)
- `dist/yoga.wasm` - Required WASM file for UI layout
- `dist/seerdb.sh` - Wrapper script for easy execution

## Running the Executable

### Option 1: Using the wrapper script (Recommended)

The wrapper script handles path resolution automatically:

```bash
./dist/seerdb.sh
```

You can run this from anywhere, and it will work correctly.

### Option 2: Running directly from dist folder

```bash
cd dist
./seerdb
```

**Note**: The executable must be run from the `dist` directory (or yoga.wasm must be in the same directory) because Ink's yoga-wasm-web dependency requires the WASM file to be present.

## Installing Globally

To make SeerDB available system-wide:

```bash
# Create a directory for the executable
sudo mkdir -p /usr/local/lib/seerdb

# Copy the executable and required files
sudo cp dist/seerdb /usr/local/lib/seerdb/
sudo cp dist/yoga.wasm /usr/local/lib/seerdb/

# Create a symlink in your PATH
sudo ln -sf /usr/local/lib/seerdb/seerdb /usr/local/bin/seerdb

# Or use the wrapper script approach
sudo cp dist/seerdb.sh /usr/local/bin/seerdb
```

Now you can run `seerdb` from anywhere!

## Distribution

When distributing the executable, you **must** include both files:
- `seerdb` (or `seerdb.exe` on Windows)
- `yoga.wasm`

They must be in the same directory. The recommended approach is to:

1. **Option A**: Distribute the wrapper script
   - Include `seerdb`, `yoga.wasm`, and `seerdb.sh`
   - Users run `./seerdb.sh`

2. **Option B**: Create a proper installer
   - Install to `/usr/local/lib/seerdb/` (or `C:\Program Files\SeerDB\` on Windows)
   - Add symlink/shortcut to user's PATH

## Platform-Specific Builds

The current executable is built for:
- **Architecture**: ARM64 (Apple Silicon)
- **OS**: macOS
- **Format**: Mach-O executable

To build for different platforms, you'll need to:
1. Build on the target platform, or
2. Use Bun's cross-compilation features (when available)

## Technical Details

- **Size**: ~59MB (includes Bun runtime and all dependencies)
- **Runtime**: Self-contained (no Node.js/Bun installation required)
- **Dependencies**: Only requires `yoga.wasm` at runtime
- **Database Drivers**: PostgreSQL, MySQL, and SQLite support built-in

## Troubleshooting

### "Cannot find module './yoga.wasm'" error

This means the executable can't find `yoga.wasm`. Solutions:
1. Use the wrapper script: `./dist/seerdb.sh`
2. Run from the dist directory: `cd dist && ./seerdb`
3. Ensure `yoga.wasm` is in the same directory as the executable

### Permission denied

Make the executable runnable:
```bash
chmod +x dist/seerdb
chmod +x dist/seerdb.sh
```

## Development Notes

The build process:
1. Copies `yoga.wasm` from `node_modules/ink/node_modules/yoga-wasm-web/dist/`
2. Compiles the TypeScript source with Bun's `--compile` flag
3. Creates a wrapper script for convenient execution

External dependencies (not bundled):
- `react-devtools-core` - Development only
- `bun:sqlite` - Bun's native SQLite binding
