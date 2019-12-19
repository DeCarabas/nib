/**
 * Resolve a relative URL (like you might find in a dependency list to an
 * absolute URL, using browser trickery.
 *
 * @param url The URL to resolve.
 */
function resolveUrl(url, base) {
    var doc = document, old_base = doc.getElementsByTagName("base")[0], old_href = old_base && old_base.href, doc_head = doc.head || doc.getElementsByTagName("head")[0], our_base = old_base || doc_head.appendChild(doc.createElement("base")), resolver = doc.createElement("a"), resolved_url;
    if (base) {
        our_base.href = base;
    }
    resolver.href = url;
    resolved_url = resolver.href; // browser magic at work here
    if (old_base)
        old_base.href = old_href;
    else
        doc_head.removeChild(our_base);
    return resolved_url + ".js";
}
const loadedModuleCache = {};
/**
 * Load the specified module. Ensures that each module is loaded exactly once.
 *
 * @param base The base URL, for resolving relative URLs.
 * @param url The URL of the module to load; which may be relative.
 * @param callback The callback to call when the module has been loaded.
 */
function loadModule(base, url, callback) {
    const absoluteUrl = resolveUrl(url, base);
    let mod = loadedModuleCache[absoluteUrl];
    if (mod) {
        if (mod.state === "loaded") {
            callback(mod.value);
        }
        else {
            mod.callbacks.push(callback);
        }
    }
    else {
        console.log(`Loading ${absoluteUrl}...`);
        mod = { state: "loading", callbacks: [callback] };
        loadedModuleCache[absoluteUrl] = mod;
        const elem = document.createElement("script");
        elem.async = true;
        elem.src = absoluteUrl;
        document.head.appendChild(elem);
    }
}
/**
 * The AMD module definition function; the heart of the entire loader.
 *
 * @param requirements
 * Dependencies to load, before running the specified factory. If you have no
 * dependencies you can just put the factory here.
 *
 * @param factory
 * The function to call to define the module. Either return a value from here,
 * or depend on `exports` and set values on the exports object.
 */
function define(requirements, factory) {
    // NOTE: Technically AMD lets me put a name as the first arg but I'll get
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
    const args = Array(requirements.length).fill(null);
    // The `exports` object, in case it was requested.
    const exportObject = {};
    // The local mapping of dependency (as specified in the input!) to resolved
    // value, for implementing `require`.
    const byName = {};
    function finish() {
        console.log(`${name}: All requirements loaded, calling factory...`);
        let result = factory(...args);
        if (!result) {
            result = exportObject;
        }
        console.log(`${name}: Loaded!`);
        let entry = loadedModuleCache[name];
        loadedModuleCache[name] = { state: "loaded", value: result };
        if (entry && entry.state === "loading") {
            entry.callbacks.forEach(callback => callback(result));
        }
    }
    console.log(`${name}: Loading (after [${requirements}])`);
    let pending = 0;
    requirements.forEach((requirement, index) => {
        if (requirement === "require") {
            args[index] = byName[requirement] = (mod) => byName[mod];
        }
        else if (requirement === "exports") {
            args[index] = byName[requirement] = exportObject;
        }
        else {
            pending += 1;
            window.setTimeout(() => {
                loadModule(name, requirement, value => {
                    console.log(`${name}: Loaded dependency ${requirement}`);
                    args[index] = byName[requirement] = value;
                    pending -= 1;
                    if (pending === 0) {
                        finish();
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
//# sourceMappingURL=loader.js.map