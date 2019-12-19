// John's crappy AMD loader. This doesn't do half of the things supported by
// requirejs, but it does enough to load my compiled typescript and all its
// dependencies.
//
type Factory = (...modules: any[]) => any;

/**
 * Resolve a relative URL (like you might find in a dependency list to an
 * absolute URL, using browser trickery.
 *
 * @param url The URL to resolve.
 */
function resolveUrl(url: string, base: string): string {
  var doc = document,
    old_base = doc.getElementsByTagName("base")[0],
    old_href = old_base && old_base.href,
    doc_head = doc.head || doc.getElementsByTagName("head")[0],
    our_base = old_base || doc_head.appendChild(doc.createElement("base")),
    resolver = doc.createElement("a"),
    resolved_url;

  if (base) {
    our_base.href = base;
  }

  resolver.href = url;
  resolved_url = resolver.href; // browser magic at work here

  if (old_base) old_base.href = old_href;
  else doc_head.removeChild(our_base);

  return resolved_url + ".js";
}

type ModuleLoadCallback = (error: Error, module: any) => void;

interface LoadingCachedModule {
  state: "loading";
  callbacks: ModuleLoadCallback[];
}

interface LoadedCachedModule {
  state: "loaded";
  value: any;
  error: Error;
}

const loadedModuleCache: {
  [url: string]: LoadingCachedModule | LoadedCachedModule;
} = {};

function loadModule(
  onBehalfOf: string,
  url: string,
  callback: (err: Error, value: any) => void
): void {
  const absoluteUrl = resolveUrl(url, onBehalfOf);
  let mod = loadedModuleCache[absoluteUrl];
  if (mod) {
    if (mod.state === "loaded") {
      callback(mod.error, mod.value);
    } else {
      mod.callbacks.push(callback);
    }
  } else {
    console.log(`Loading ${absoluteUrl}...`);
    mod = { state: "loading", callbacks: [callback] };
    loadedModuleCache[absoluteUrl] = mod;

    const elem = document.createElement("script");
    elem.async = true;
    elem.src = absoluteUrl;
    document.head.appendChild(elem);
  }
}

function define(requirements: string[] | Factory, factory?: Factory) {
  // TODO: Technically AMD lets me put a name as the first arg but I'll get
  //       there when I get there.
  if (typeof requirements === "function") {
    factory = requirements;
    requirements = [];
  }

  const scriptElement = document.currentScript;
  if (!(scriptElement instanceof HTMLScriptElement)) {
    throw new Error("Don't know what to do, not in a script tag.");
  }

  // The name of the module being defined.
  const name = scriptElement.src;

  // The array of resolved dependencies, to pass into the factory.
  const args: any[] = Array(requirements.length).fill(null);

  // The `exports` object, in case it was requested.
  const exportObject: object = {};

  // The local mapping of dependency (as specified in the input!) to resolved
  // value, for implementing `require`.
  const byName: { [module: string]: any } = {};

  function finish() {
    console.log(`${name}: All requirements loaded, calling factory...`);
    let result = factory(...args);
    if (!result) {
      result = exportObject;
    }
    console.log(`${name}: Loaded!`);

    let entry = loadedModuleCache[name];
    loadedModuleCache[name] = { state: "loaded", error: null, value: result };
    if (entry && entry.state === "loading") {
      entry.callbacks.forEach(callback => callback(null, result));
    }
  }

  console.log(`${name}: Loading (after [${requirements}])`);
  let pending = 0;
  requirements.forEach((requirement, index) => {
    if (requirement === "require") {
      args[index] = byName[requirement] = (mod: string) => byName[mod];
    } else if (requirement === "exports") {
      args[index] = byName[requirement] = exportObject;
    } else {
      pending += 1;
      window.setTimeout(() => {
        loadModule(name, requirement, (err, value) => {
          if (!err) {
            console.log(`${name}: Loaded dependency ${requirement}`);
            args[index] = byName[requirement] = value;
            pending -= 1;
            if (pending === 0) {
              finish();
            }
          }
        });
      }, 0);
    }
  });

  if (pending === 0) {
    finish();
  }
}
define.amd = { dotyLoader: true };
