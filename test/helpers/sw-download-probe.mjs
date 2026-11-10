const message = JSON.parse(process.argv[2]);

hide(URL, 'createObjectURL');
hide(URL, 'revokeObjectURL');
for (const name of ['document', 'window', 'DOMParser', 'localStorage']) hide(globalThis, name);

if (typeof URL.createObjectURL === 'function' || typeof URL.revokeObjectURL === 'function') {
  console.error('blob URL helpers are still callable');
  process.exit(2);
}
for (const name of ['document', 'window', 'DOMParser', 'localStorage']) {
  if (globalThis[name] != null) {
    console.error(`${name} is still defined`);
    process.exit(2);
  }
}

let captured;
globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener(fn) {
        globalThis.__aceOnMessage = fn;
      },
    },
    lastError: undefined,
  },
  downloads: {
    download(options, callback) {
      captured = {
        url: options.url,
        filename: options.filename,
        saveAs: options.saveAs,
        conflictAction: options.conflictAction,
      };
      callback(1);
    },
  },
};

await import(new URL('../../src/background.js', import.meta.url));

if (typeof globalThis.__aceOnMessage !== 'function') {
  console.error('download listener was not registered');
  process.exit(1);
}

const response = await new Promise((resolve) => {
  globalThis.__aceOnMessage(message, {}, resolve);
});
if (!response?.ok) {
  console.error(response?.error || 'download failed');
  process.exit(1);
}
process.stdout.write(JSON.stringify(captured));

function hide(object, key) {
  try {
    Object.defineProperty(object, key, { value: undefined, configurable: true, writable: true });
  } catch {
    object[key] = undefined;
  }
}
