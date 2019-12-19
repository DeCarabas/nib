// John's crappy AMD loader. This doesn't do half of the things supported by
// requirejs, but it does enough to load my compiled typescript and all its
// dependencies.
//
type Factory = (...modules: any[]) => any;

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
function encapsulatedEval(env: object, code: string): any {
  const locals = Object.keys(env);
  const values = Object.values(env);
  const body = `return eval(${JSON.stringify(code)})`;
  const fn = new Function(...locals, body);
  return fn.apply(this, values);
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
  [path: string]: LoadingCachedModule | LoadedCachedModule;
} = {};

function define(requirements: string[] | Factory, factory?: Factory) {
  function defineImpl(
    name: string,
    onComplete: (module: any) => void,
    requirements: string[] | Factory,
    factory?: Factory
  ) {
    if (typeof requirements === "function") {
      factory = requirements;
      requirements = [];
    }

    console.log(
      `${name}: Beginning definition with requirements '${requirements}'`
    );

    const resolved: any[] = Array(requirements.length).fill(null);
    const exports = {};
    const localMapping: { [module: string]: any } = {};
    let pending = 0;
    function require(module: string): any {
      const value = localMapping[module];
      //console.log(`${name}: Requiring ${module} => ${value}`);
      return value;
    }

    function resolveUrl(url: string): string {
      var doc = document,
        old_base = doc.getElementsByTagName("base")[0],
        old_href = old_base && old_base.href,
        doc_head = doc.head || doc.getElementsByTagName("head")[0],
        our_base = old_base || doc_head.appendChild(doc.createElement("base")),
        resolver = doc.createElement("a"),
        resolved_url;

      if (name !== "[top]") {
        our_base.href = name;
      }

      resolver.href = url;
      resolved_url = resolver.href; // browser magic at work here

      if (old_base) old_base.href = old_href;
      else doc_head.removeChild(our_base);

      return resolved_url + ".js";
    }

    async function load(
      module: string,
      callback: (error: Error, module: any) => void
    ) {
      module = resolveUrl(module);

      let cacheEntry = loadedModuleCache[module];
      if (cacheEntry) {
        if (cacheEntry.state === "loaded") {
          callback(cacheEntry.error, cacheEntry.value);
        } else {
          cacheEntry.callbacks.push(callback);
        }
      } else {
        cacheEntry = { state: "loading", callbacks: [callback] };
        loadedModuleCache[module] = cacheEntry;

        function complete(error: Error, value: any) {
          if (cacheEntry.state === "loading") {
            const callbacks = cacheEntry.callbacks;
            cacheEntry = { state: "loaded", value: value, error: error };
            loadedModuleCache[module] = cacheEntry;
            callbacks.forEach(cb => cb(error, value));
          }
        }

        console.log(`${name}: Fetching module ${module}`);
        let text: string = null;
        try {
          const response = await fetch(module);
          if (!response.ok) {
            console.error(
              `${name}: Server returned an error response: ${response.statusText}`
            );
            complete(
              Error(`Failed to load ${module}: ${response.statusText}`),
              null
            );
            return;
          } else {
            text = await response.text();
          }
        } catch (error) {
          console.error(`${name}: Failed to fetch the module: ${error}`);
          complete(Error(`Failed to load ${module}: ${error}`), null);
          return;
        }

        // Set up the global hook to catch results, then eval (which should
        // capture the results) and return.
        console.log(`${name}: Fetched ${module}, now loading...`);
        function nestedDefine(
          requirements: string[] | Factory,
          factory?: Factory
        ) {
          defineImpl(module, m => complete(null, m), requirements, factory);
        }
        nestedDefine.amd = { dotyLoader: true, onBehalfOf: name };
        encapsulatedEval({ define: nestedDefine }, text);
      }
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
      } else if (requirement === "exports") {
        resolved[index] = exports;
      } else {
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
