var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Evaluates a function in an environment that's isolated from the global
 * environment. The bug with this approach is that the code from the individual
 * modules is invisible to the debugger, has bad names, &c. We really should be
 * doing this with script tags.
 *
 * @param env
 * An object whose keys and values will become the environment for the evaluated
 * code.
 *
 * @param code
 * The code to eval.
 */
function encapsulatedEval(env, code) {
    const locals = Object.keys(env);
    const values = Object.values(env);
    const body = `return eval(${JSON.stringify(code)})`;
    const fn = new Function(...locals, body);
    return fn.apply(this, values);
}
const loadedModuleCache = {};
function define(requirements, factory) {
    function defineImpl(name, onComplete, requirements, factory) {
        if (typeof requirements === "function") {
            factory = requirements;
            requirements = [];
        }
        console.log(`${name}: Beginning definition with requirements '${requirements}'`);
        const resolved = Array(requirements.length).fill(null);
        const exports = {};
        const localMapping = {};
        let pending = 0;
        function require(module) {
            const value = localMapping[module];
            //console.log(`${name}: Requiring ${module} => ${value}`);
            return value;
        }
        function resolveUrl(url) {
            var doc = document, old_base = doc.getElementsByTagName("base")[0], old_href = old_base && old_base.href, doc_head = doc.head || doc.getElementsByTagName("head")[0], our_base = old_base || doc_head.appendChild(doc.createElement("base")), resolver = doc.createElement("a"), resolved_url;
            if (name !== "[top]") {
                our_base.href = name;
            }
            resolver.href = url;
            resolved_url = resolver.href; // browser magic at work here
            if (old_base)
                old_base.href = old_href;
            else
                doc_head.removeChild(our_base);
            return resolved_url + ".js";
        }
        function load(module, callback) {
            return __awaiter(this, void 0, void 0, function* () {
                module = resolveUrl(module);
                let cacheEntry = loadedModuleCache[module];
                if (cacheEntry) {
                    if (cacheEntry.state === "loaded") {
                        callback(cacheEntry.error, cacheEntry.value);
                    }
                    else {
                        cacheEntry.callbacks.push(callback);
                    }
                }
                else {
                    cacheEntry = { state: "loading", callbacks: [callback] };
                    loadedModuleCache[module] = cacheEntry;
                    function complete(error, value) {
                        if (cacheEntry.state === "loading") {
                            const callbacks = cacheEntry.callbacks;
                            cacheEntry = { state: "loaded", value: value, error: error };
                            loadedModuleCache[module] = cacheEntry;
                            callbacks.forEach(cb => cb(error, value));
                        }
                    }
                    console.log(`${name}: Fetching module ${module}`);
                    let text = null;
                    try {
                        const response = yield fetch(module);
                        if (!response.ok) {
                            console.error(`${name}: Server returned an error response: ${response.statusText}`);
                            complete(Error(`Failed to load ${module}: ${response.statusText}`), null);
                            return;
                        }
                        else {
                            text = yield response.text();
                        }
                    }
                    catch (error) {
                        console.error(`${name}: Failed to fetch the module: ${error}`);
                        complete(Error(`Failed to load ${module}: ${error}`), null);
                        return;
                    }
                    // Set up the global hook to catch results, then eval (which should
                    // capture the results) and return.
                    console.log(`${name}: Fetched ${module}, now loading...`);
                    function nestedDefine(requirements, factory) {
                        defineImpl(module, m => complete(null, m), requirements, factory);
                    }
                    nestedDefine.amd = { dotyLoader: true, onBehalfOf: name };
                    encapsulatedEval({ define: nestedDefine }, text);
                }
            });
        }
        function finish() {
            console.log(`${name}: All requirements satisfied, running factory...`);
            let result = factory(...resolved);
            if (result === undefined) {
                result = exports;
            }
            console.log(`${name}: Done!`);
            onComplete(result);
        }
        requirements.forEach((requirement, index) => {
            if (requirement === "require") {
                resolved[index] = require;
            }
            else if (requirement === "exports") {
                resolved[index] = exports;
            }
            else {
                pending += 1;
                window.setTimeout(() => {
                    load(requirement, (err, mod) => {
                        if (err) {
                            console.log(`Failed to load ${requirement}: ${err}`);
                            throw err;
                        }
                        localMapping[requirement] = mod;
                        resolved[index] = mod;
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
    defineImpl("[top]", m => console.log("All done!"), requirements, factory);
}
define.amd = { dotyLoader: true };
