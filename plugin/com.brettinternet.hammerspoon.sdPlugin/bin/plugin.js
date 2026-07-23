import require$$0$4 from 'events';
import require$$1$2 from 'https';
import require$$2$1 from 'http';
import require$$3$1 from 'net';
import require$$4$1 from 'tls';
import require$$1$1 from 'crypto';
import require$$0$3 from 'stream';
import require$$7$1 from 'url';
import require$$0$1 from 'zlib';
import require$$0$2 from 'buffer';
import fs, { existsSync, readFileSync } from 'node:fs';
import path, { join } from 'node:path';
import { cwd } from 'node:process';
import { randomUUID, timingSafeEqual, hkdfSync, createHmac, randomBytes } from 'node:crypto';
import { EventEmitter as EventEmitter$1 } from 'node:events';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { inflateSync } from 'node:zlib';

/**
 * Default language supported by all i18n providers.
 */
const defaultLanguage = "en";

/**
 * Creates a {@link IDisposable} that defers the disposing to the {@link dispose} function; disposing is guarded so that it may only occur once.
 * @param dispose Function responsible for disposing.
 * @returns Disposable whereby the disposing is delegated to the {@link dispose}  function.
 */
function deferredDisposable(dispose) {
    let isDisposed = false;
    const guardedDispose = () => {
        if (!isDisposed) {
            dispose();
            isDisposed = true;
        }
    };
    return {
        [Symbol.dispose]: guardedDispose,
        dispose: guardedDispose,
    };
}

/**
 * An event emitter that enables the listening for, and emitting of, events.
 */
class EventEmitter {
    /**
     * Underlying collection of events and their listeners.
     */
    events = new Map();
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the {@link listener} added.
     */
    addListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}, and returns a disposable capable of removing the event listener.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    disposableOn(eventName, listener) {
        this.add(eventName, listener, (listeners) => listeners.push({ listener }));
        return deferredDisposable(() => this.removeListener(eventName, listener));
    }
    /**
     * Emits the {@link eventName}, invoking all event listeners with the specified {@link args}.
     * @param eventName Name of the event.
     * @param args Arguments supplied to each event listener.
     * @returns `true` when there was a listener associated with the event; otherwise `false`.
     */
    emit(eventName, ...args) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined) {
            return false;
        }
        for (let i = 0; i < listeners.length;) {
            const { listener, once } = listeners[i];
            if (once) {
                this.remove(eventName, listeners, i);
            }
            else {
                i++;
            }
            listener(...args);
        }
        return true;
    }
    /**
     * Gets the event names with event listeners.
     * @returns Event names.
     */
    eventNames() {
        return Array.from(this.events.keys());
    }
    /**
     * Gets the number of event listeners for the event named {@link eventName}. When a {@link listener} is defined, only matching event listeners are counted.
     * @param eventName Name of the event.
     * @param listener Optional event listener to count.
     * @returns Number of event listeners.
     */
    listenerCount(eventName, listener) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined || listener == undefined) {
            return listeners?.length || 0;
        }
        let count = 0;
        listeners.forEach((ev) => {
            if (ev.listener === listener) {
                count++;
            }
        });
        return count;
    }
    /**
     * Gets the event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns The event listeners.
     */
    listeners(eventName) {
        return Array.from(this.events.get(eventName) || []).map(({ listener }) => listener);
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    off(eventName, listener) {
        const listeners = this.events.get(eventName) ?? [];
        for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i].listener === listener) {
                this.remove(eventName, listeners, i);
            }
        }
        return this;
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    on(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    once(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener, once: true }));
    }
    /**
     * Adds the event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependOnceListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener, once: true }));
    }
    /**
     * Removes all event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns This instance with the event listeners removed
     */
    removeAllListeners(eventName) {
        const listeners = this.events.get(eventName) ?? [];
        while (listeners.length > 0) {
            this.remove(eventName, listeners, 0);
        }
        this.events.delete(eventName);
        return this;
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    removeListener(eventName, listener) {
        return this.off(eventName, listener);
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @param fn Function responsible for adding the new event handler function.
     * @returns This instance with event {@link listener} added.
     */
    add(eventName, listener, fn) {
        let listeners = this.events.get(eventName);
        if (listeners === undefined) {
            listeners = [];
            this.events.set(eventName, listeners);
        }
        fn(listeners);
        if (eventName !== "newListener") {
            const args = [eventName, listener];
            this.emit("newListener", ...args);
        }
        return this;
    }
    /**
     * Removes the listener at the given index.
     * @param eventName Name of the event.
     * @param listeners Listeners registered with the event.
     * @param index Index of the listener to remove.
     */
    remove(eventName, listeners, index) {
        const [{ listener }] = listeners.splice(index, 1);
        if (eventName !== "removeListener") {
            const args = [eventName, listener];
            this.emit("removeListener", ...args);
        }
    }
}

/**
 * Prevents the modification of existing property attributes and values on the value, and all of its child properties, and prevents the addition of new properties.
 * @param value Value to freeze.
 */
function freeze(value) {
    if (value !== undefined && value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
    }
}
/**
 * Gets the value at the specified {@link path}.
 * @param source Source object that is being read from.
 * @param path Path to the property to get.
 * @returns Value of the property.
 */
function get(source, path) {
    const props = path.split(".");
    return props.reduce((obj, prop) => obj && obj[prop], source);
}

/**
 * Internalization provider, responsible for managing localizations and translating resources.
 */
class I18nProvider {
    /**
     * Backing field for the default language.
     */
    #language;
    /**
     * Map of localized resources, indexed by their language.
     */
    #translations = new Map();
    /**
     * Function responsible for providing localized resources for a given language.
     */
    #readTranslations;
    /**
     * Internal events handler.
     */
    #events = new EventEmitter();
    /**
     * Initializes a new instance of the {@link I18nProvider} class.
     * @param language The default language to be used when retrieving translations for a given key.
     * @param readTranslations Function responsible for providing localized resources for a given language.
     */
    constructor(language, readTranslations) {
        this.#language = language;
        this.#readTranslations = readTranslations;
    }
    /**
     * The default language of the provider.
     * @returns The language.
     */
    get language() {
        return this.#language;
    }
    /**
     * The default language of the provider.
     * @param value The language.
     */
    set language(value) {
        if (this.#language !== value) {
            this.#language = value;
            this.#events.emit("languageChange", value);
        }
    }
    /**
     * Adds an event listener that is called when the language within the provider changes.
     * @param listener Listener function to be called.
     * @returns Resource manager that, when disposed, removes the event listener.
     */
    onLanguageChange(listener) {
        return this.#events.disposableOn("languageChange", listener);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked. Alias of {@link I18nProvider.translate}.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    t(key, language = this.language) {
        return this.translate(key, language);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    translate(key, language = this.language) {
        // Determine the languages to search for.
        const languages = new Set([
            language,
            language.replaceAll("_", "-").split("-").at(0),
            defaultLanguage,
        ]);
        // Attempt to find the resource for the languages.
        for (const language of languages) {
            const resource = get(this.getTranslations(language), key);
            if (resource) {
                return resource.toString();
            }
        }
        // Otherwise fallback to the key.
        return key;
    }
    /**
     * Gets the translations for the specified language.
     * @param language Language whose translations are being retrieved.
     * @returns The translations; otherwise `null`.
     */
    getTranslations(language) {
        let translations = this.#translations.get(language);
        if (translations === undefined) {
            translations = this.#readTranslations(language);
            freeze(translations);
            this.#translations.set(language, translations);
        }
        return translations;
    }
}

/**
 * Provides a read-only iterable collection of items that also acts as a partial polyfill for iterator helpers.
 */
class Enumerable {
    /**
     * Backing function responsible for providing the iterator of items.
     */
    #items;
    /**
     * Backing function for {@link Enumerable.length}.
     */
    #length;
    /**
     * Captured iterator from the underlying iterable; used to fulfil {@link IterableIterator} methods.
     */
    #iterator;
    /**
     * Initializes a new instance of the {@link Enumerable} class.
     * @param source Source that contains the items.
     * @returns The enumerable.
     */
    constructor(source) {
        if (source instanceof Enumerable) {
            // Enumerable
            this.#items = source.#items;
            this.#length = source.#length;
        }
        else if (Array.isArray(source)) {
            // Array
            this.#items = () => source.values();
            this.#length = () => source.length;
        }
        else if (source instanceof Map || source instanceof Set) {
            // Map or Set
            this.#items = () => source.values();
            this.#length = () => source.size;
        }
        else {
            // IterableIterator delegate
            this.#items = source;
            this.#length = () => {
                let i = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const _ of this) {
                    i++;
                }
                return i;
            };
        }
    }
    /**
     * Gets the number of items in the enumerable.
     * @returns The number of items.
     */
    get length() {
        return this.#length();
    }
    /**
     * Gets the iterator for the enumerable.
     * @yields The items.
     */
    *[Symbol.iterator]() {
        for (const item of this.#items()) {
            yield item;
        }
    }
    /**
     * Transforms each item within this iterator to an indexed pair, with each pair represented as an array.
     * @returns An iterator of indexed pairs.
     */
    asIndexedPairs() {
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                yield [i++, item];
            }
        }.bind(this));
    }
    /**
     * Returns an iterator with the first items dropped, up to the specified limit.
     * @param limit The number of elements to drop from the start of the iteration.
     * @returns An iterator of items after the limit.
     */
    drop(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ >= limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Determines whether all items satisfy the specified predicate.
     * @param predicate Function that determines whether each item fulfils the predicate.
     * @returns `true` when all items satisfy the predicate; otherwise `false`.
     */
    every(predicate) {
        for (const item of this) {
            if (!predicate(item)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Returns an iterator of items that meet the specified predicate..
     * @param predicate Function that determines which items to filter.
     * @returns An iterator of filtered items.
     */
    filter(predicate) {
        return new Enumerable(function* () {
            for (const item of this) {
                if (predicate(item)) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Finds the first item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    find(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return item;
            }
        }
    }
    /**
     * Finds the last item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    findLast(predicate) {
        let result = undefined;
        for (const item of this) {
            if (predicate(item)) {
                result = item;
            }
        }
        return result;
    }
    /**
     * Returns an iterator containing items transformed using the specified mapper function.
     * @param mapper Function responsible for transforming each item.
     * @returns An iterator of transformed items.
     */
    flatMap(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                for (const mapped of mapper(item)) {
                    yield mapped;
                }
            }
        }.bind(this));
    }
    /**
     * Iterates over each item, and invokes the specified function.
     * @param fn Function to invoke against each item.
     */
    forEach(fn) {
        for (const item of this) {
            fn(item);
        }
    }
    /**
     * Determines whether the search item exists in the collection exists.
     * @param search Item to search for.
     * @returns `true` when the item was found; otherwise `false`.
     */
    includes(search) {
        return this.some((item) => item === search);
    }
    /**
     * Returns an iterator of mapped items using the mapper function.
     * @param mapper Function responsible for mapping the items.
     * @returns An iterator of mapped items.
     */
    map(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                yield mapper(item);
            }
        }.bind(this));
    }
    /**
     * Captures the underlying iterable, if it is not already captured, and gets the next item in the iterator.
     * @param args Optional values to send to the generator.
     * @returns An iterator result of the current iteration; when `done` is `false`, the current `value` is provided.
     */
    next(...args) {
        this.#iterator ??= this.#items();
        const result = this.#iterator.next(...args);
        if (result.done) {
            this.#iterator = undefined;
        }
        return result;
    }
    /**
     * Applies the accumulator function to each item, and returns the result.
     * @param accumulator Function responsible for accumulating all items within the collection.
     * @param initial Initial value supplied to the accumulator.
     * @returns Result of accumulating each value.
     */
    reduce(accumulator, initial) {
        if (this.length === 0) {
            if (initial === undefined) {
                throw new TypeError("Reduce of empty enumerable with no initial value.");
            }
            return initial;
        }
        let result = initial;
        for (const item of this) {
            if (result === undefined) {
                result = item;
            }
            else {
                result = accumulator(result, item);
            }
        }
        return result;
    }
    /**
     * Acts as if a `return` statement is inserted in the generator's body at the current suspended position.
     *
     * Please note, in the context of an {@link Enumerable}, calling {@link Enumerable.return} will clear the captured iterator,
     * if there is one. Subsequent calls to {@link Enumerable.next} will result in re-capturing the underlying iterable, and
     * yielding items from the beginning.
     * @param value Value to return.
     * @returns The value as an iterator result.
     */
    return(value) {
        this.#iterator = undefined;
        return { done: true, value };
    }
    /**
     * Determines whether an item in the collection exists that satisfies the specified predicate.
     * @param predicate Function used to search for an item.
     * @returns `true` when the item was found; otherwise `false`.
     */
    some(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns an iterator with the items, from 0, up to the specified limit.
     * @param limit Limit of items to take.
     * @returns An iterator of items from 0 to the limit.
     */
    take(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ < limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Acts as if a `throw` statement is inserted in the generator's body at the current suspended position.
     * @param e Error to throw.
     */
    throw(e) {
        throw e;
    }
    /**
     * Converts this iterator to an array.
     * @returns The array of items from this iterator.
     */
    toArray() {
        return Array.from(this);
    }
    /**
     * Converts this iterator to serializable collection.
     * @returns The serializable collection of items.
     */
    toJSON() {
        return this.toArray();
    }
    /**
     * Converts this iterator to a string.
     * @returns The string.
     */
    toString() {
        return `${this.toArray()}`;
    }
}

// Polyfill, explicit resource management https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Symbol.dispose ??= Symbol("Symbol.dispose");

/**
 * Provides a wrapper around a value that is lazily instantiated.
 */
class Lazy {
    /**
     * Private backing field for {@link Lazy.value}.
     */
    #value = undefined;
    /**
     * Factory responsible for instantiating the value.
     */
    #valueFactory;
    /**
     * Initializes a new instance of the {@link Lazy} class.
     * @param valueFactory The factory responsible for instantiating the value.
     */
    constructor(valueFactory) {
        this.#valueFactory = valueFactory;
    }
    /**
     * Gets the value.
     * @returns The value.
     */
    get value() {
        if (this.#value === undefined) {
            this.#value = this.#valueFactory();
        }
        return this.#value;
    }
}

/**
 * Returns an object that contains a promise and two functions to resolve or reject it.
 * @returns The promise, and the resolve and reject functions.
 */
function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** A special constant with type `never` */
function $constructor(name, initializer, params) {
    function init(inst, def) {
        var _a;
        Object.defineProperty(inst, "_zod", {
            value: inst._zod ?? {},
            enumerable: false,
        });
        (_a = inst._zod).traits ?? (_a.traits = new Set());
        inst._zod.traits.add(name);
        initializer(inst, def);
        // support prototype modifications
        for (const k in _.prototype) {
            if (!(k in inst))
                Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
        }
        inst._zod.constr = _;
        inst._zod.def = def;
    }
    // doesn't work if Parent has a constructor with arguments
    const Parent = params?.Parent ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
        var _a;
        const inst = params?.Parent ? new Definition() : this;
        init(inst, def);
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        for (const fn of inst._zod.deferred) {
            fn();
        }
        return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
        value: (inst) => {
            if (params?.Parent && inst instanceof params.Parent)
                return true;
            return inst?._zod?.traits?.has(name);
        },
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
}
class $ZodAsyncError extends Error {
    constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
}
const globalConfig = {};
function config(newConfig) {
    return globalConfig;
}

// functions
function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
        return value.toString();
    return value;
}
function cached(getter) {
    return {
        get value() {
            {
                const value = getter();
                Object.defineProperty(this, "value", { value });
                return value;
            }
        },
    };
}
function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
}
function defineLazy(object, key, getter) {
    Object.defineProperty(object, key, {
        get() {
            {
                const value = getter();
                object[key] = value;
                return value;
            }
        },
        set(v) {
            Object.defineProperty(object, key, {
                value: v,
                // configurable: true,
            });
            // object[key] = v;
        },
        configurable: true,
    });
}
function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function esc(str) {
    return JSON.stringify(str);
}
const captureStackTrace = Error.captureStackTrace
    ? Error.captureStackTrace
    : (..._args) => { };
function isObject$1(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}
const allowsEval = cached(() => {
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// zod-specific utils
function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
        cl._zod.parent = inst;
    return cl;
}
function normalizeParams(_params) {
    return {};
}
function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
        return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
    });
}
function aborted(x, startIndex = 0) {
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue !== true)
            return true;
    }
    return false;
}
function prefixIssues(path, issues) {
    return issues.map((iss) => {
        var _a;
        (_a = iss).path ?? (_a.path = []);
        iss.path.unshift(path);
        return iss;
    });
}
function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
    const full = { ...iss, path: iss.path ?? [] };
    // for backwards compatibility
    if (!iss.message) {
        const message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ??
            unwrapMessage(ctx?.error?.(iss)) ??
            unwrapMessage(config.customError?.(iss)) ??
            unwrapMessage(config.localeError?.(iss)) ??
            "Invalid input";
        full.message = message;
    }
    // delete (full as any).def;
    delete full.inst;
    delete full.continue;
    if (!ctx?.reportInput) {
        delete full.input;
    }
    return full;
}

const initializer = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false,
    });
    Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false,
    });
    Object.defineProperty(inst, "message", {
        get() {
            return JSON.stringify(def, jsonStringifyReplacer, 2);
        },
        enumerable: true,
        // configurable: false,
    });
    Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false,
    });
};
const $ZodError = $constructor("$ZodError", initializer);
const $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });

const _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
    }
    return result.value;
};
const parse = /* @__PURE__*/ _parse($ZodRealError);
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
    }
    return result.value;
};
const parseAsync = /* @__PURE__*/ _parseAsync($ZodRealError);
const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    return result.issues.length
        ? {
            success: false,
            error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParse = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    return result.issues.length
        ? {
            success: false,
            error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParseAsync = /* @__PURE__*/ _safeParseAsync($ZodRealError);

const string$1 = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
};
const number$1 = /^-?\d+(?:\.\d+)?/i;
const boolean$1 = /true|false/i;

class Doc {
    constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
            this.args = args;
    }
    indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
    }
    write(arg) {
        if (typeof arg === "function") {
            arg(this, { execution: "sync" });
            arg(this, { execution: "async" });
            return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
            this.content.push(line);
        }
    }
    compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        // console.log(lines.join("\n"));
        return new F(...args, lines.join("\n"));
    }
}

const version = {
    major: 4,
    minor: 0,
    patch: 0,
};

const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def; // set _def property
    inst._zod.bag = inst._zod.bag || {}; // initialize _bag object
    inst._zod.version = version;
    const checks = [...(inst._zod.def.checks ?? [])];
    // if inst is itself a checks.$ZodCheck, run it as a check
    if (inst._zod.traits.has("$ZodCheck")) {
        checks.unshift(inst);
    }
    //
    for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
            fn(inst);
        }
    }
    if (checks.length === 0) {
        // deferred initializer
        // inst._zod.parse is not yet defined
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        inst._zod.deferred?.push(() => {
            inst._zod.run = inst._zod.parse;
        });
    }
    else {
        const runChecks = (payload, checks, ctx) => {
            let isAborted = aborted(payload);
            let asyncResult;
            for (const ch of checks) {
                if (ch._zod.def.when) {
                    const shouldRun = ch._zod.def.when(payload);
                    if (!shouldRun)
                        continue;
                }
                else if (isAborted) {
                    continue;
                }
                const currLen = payload.issues.length;
                const _ = ch._zod.check(payload);
                if (_ instanceof Promise && ctx?.async === false) {
                    throw new $ZodAsyncError();
                }
                if (asyncResult || _ instanceof Promise) {
                    asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                        await _;
                        const nextLen = payload.issues.length;
                        if (nextLen === currLen)
                            return;
                        if (!isAborted)
                            isAborted = aborted(payload, currLen);
                    });
                }
                else {
                    const nextLen = payload.issues.length;
                    if (nextLen === currLen)
                        continue;
                    if (!isAborted)
                        isAborted = aborted(payload, currLen);
                }
            }
            if (asyncResult) {
                return asyncResult.then(() => {
                    return payload;
                });
            }
            return payload;
        };
        inst._zod.run = (payload, ctx) => {
            const result = inst._zod.parse(payload, ctx);
            if (result instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return result.then((result) => runChecks(result, checks, ctx));
            }
            return runChecks(result, checks, ctx);
        };
    }
    inst["~standard"] = {
        validate: (value) => {
            try {
                const r = safeParse(inst, value);
                return r.success ? { value: r.data } : { issues: r.error?.issues };
            }
            catch (_) {
                return safeParseAsync(inst, value).then((r) => (r.success ? { value: r.data } : { issues: r.error?.issues }));
            }
        },
        vendor: "zod",
        version: 1,
    };
});
const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = [...(inst?._zod.bag?.patterns ?? [])].pop() ?? string$1(inst._zod.bag);
    inst._zod.parse = (payload, _) => {
        if (def.coerce)
            try {
                payload.value = String(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "string")
            return payload;
        payload.issues.push({
            expected: "string",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Number(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
            return payload;
        }
        const received = typeof input === "number"
            ? Number.isNaN(input)
                ? "NaN"
                : !Number.isFinite(input)
                    ? "Infinity"
                    : undefined
            : undefined;
        payload.issues.push({
            expected: "number",
            code: "invalid_type",
            input,
            inst,
            ...(received ? { received } : {}),
        });
        return payload;
    };
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean$1;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Boolean(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "boolean")
            return payload;
        payload.issues.push({
            expected: "boolean",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
function handleArrayResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                expected: "array",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = Array(input.length);
        const proms = [];
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const result = def.element._zod.run({
                value: item,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleArrayResult(result, payload, i)));
            }
            else {
                handleArrayResult(result, payload, i);
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload; //handleArrayResultsAsync(parseResults, final);
    };
});
function handleObjectResult(result, final, key) {
    // if(isOptional)
    if (result.issues.length) {
        final.issues.push(...prefixIssues(key, result.issues));
    }
    final.value[key] = result.value;
}
function handleOptionalObjectResult(result, final, key, input) {
    if (result.issues.length) {
        // validation failed against value schema
        if (input[key] === undefined) {
            // if input was undefined, ignore the error
            if (key in input) {
                final.value[key] = undefined;
            }
            else {
                final.value[key] = result.value;
            }
        }
        else {
            final.issues.push(...prefixIssues(key, result.issues));
        }
    }
    else if (result.value === undefined) {
        // validation returned `undefined`
        if (key in input)
            final.value[key] = undefined;
    }
    else {
        // non-undefined value
        final.value[key] = result.value;
    }
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodType.init(inst, def);
    const _normalized = cached(() => {
        const keys = Object.keys(def.shape);
        for (const k of keys) {
            if (!(def.shape[k] instanceof $ZodType)) {
                throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
            }
        }
        const okeys = optionalKeys(def.shape);
        return {
            shape: def.shape,
            keys,
            keySet: new Set(keys),
            numKeys: keys.length,
            optionalKeys: new Set(okeys),
        };
    });
    defineLazy(inst._zod, "propValues", () => {
        const shape = def.shape;
        const propValues = {};
        for (const key in shape) {
            const field = shape[key]._zod;
            if (field.values) {
                propValues[key] ?? (propValues[key] = new Set());
                for (const v of field.values)
                    propValues[key].add(v);
            }
        }
        return propValues;
    });
    const generateFastpass = (shape) => {
        const doc = new Doc(["shape", "payload", "ctx"]);
        const normalized = _normalized.value;
        const parseStr = (key) => {
            const k = esc(key);
            return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        };
        doc.write(`const input = payload.value;`);
        const ids = Object.create(null);
        let counter = 0;
        for (const key of normalized.keys) {
            ids[key] = `key_${counter++}`;
        }
        // A: preserve key order {
        doc.write(`const newResult = {}`);
        for (const key of normalized.keys) {
            if (normalized.optionalKeys.has(key)) {
                const id = ids[key];
                doc.write(`const ${id} = ${parseStr(key)};`);
                const k = esc(key);
                doc.write(`
        if (${id}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id}.value;
        }
        `);
            }
            else {
                const id = ids[key];
                //  const id = ids[key];
                doc.write(`const ${id} = ${parseStr(key)};`);
                doc.write(`
          if (${id}.issues.length) payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${esc(key)}, ...iss.path] : [${esc(key)}]
          })));`);
                doc.write(`newResult[${esc(key)}] = ${id}.value`);
            }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        const fn = doc.compile();
        return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject = isObject$1;
    const jit = !globalConfig.jitless;
    const allowsEval$1 = allowsEval;
    const fastEnabled = jit && allowsEval$1.value; // && !def.catchall;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
            // always synchronous
            if (!fastpass)
                fastpass = generateFastpass(def.shape);
            payload = fastpass(payload, ctx);
        }
        else {
            payload.value = {};
            const shape = value.shape;
            for (const key of value.keys) {
                const el = shape[key];
                // do not add omitted optional keys
                // if (!(key in input)) {
                //   if (optionalKeys.has(key)) continue;
                //   payload.issues.push({
                //     code: "invalid_type",
                //     path: [key],
                //     expected: "nonoptional",
                //     note: `Missing required key: "${key}"`,
                //     input,
                //     inst,
                //   });
                // }
                const r = el._zod.run({ value: input[key], issues: [] }, ctx);
                const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
                if (r instanceof Promise) {
                    proms.push(r.then((r) => isOptional ? handleOptionalObjectResult(r, payload, key, input) : handleObjectResult(r, payload, key)));
                }
                else if (isOptional) {
                    handleOptionalObjectResult(r, payload, key, input);
                }
                else {
                    handleObjectResult(r, payload, key);
                }
            }
        }
        if (!catchall) {
            // return payload;
            return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        const unrecognized = [];
        // iterate over input keys
        const keySet = value.keySet;
        const _catchall = catchall._zod;
        const t = _catchall.def.type;
        for (const key of Object.keys(input)) {
            if (keySet.has(key))
                continue;
            if (t === "never") {
                unrecognized.push(key);
                continue;
            }
            const r = _catchall.run({ value: input[key], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((r) => handleObjectResult(r, payload, key)));
            }
            else {
                handleObjectResult(r, payload, key);
            }
        }
        if (unrecognized.length) {
            payload.issues.push({
                code: "unrecognized_keys",
                keys: unrecognized,
                input,
                inst,
            });
        }
        if (!proms.length)
            return payload;
        return Promise.all(proms).then(() => {
            return payload;
        });
    };
});
function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
        if (result.issues.length === 0) {
            final.value = result.value;
            return final;
        }
    }
    final.issues.push({
        code: "invalid_union",
        input: final.value,
        inst,
        errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
    });
    return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "values", () => {
        if (def.options.every((o) => o._zod.values)) {
            return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        if (def.options.every((o) => o._zod.pattern)) {
            const patterns = def.options.map((o) => o._zod.pattern);
            return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                if (result.issues.length === 0)
                    return result;
                results.push(result);
            }
        }
        if (!async)
            return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleUnionResults(results, payload, inst, ctx);
        });
    };
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.values = new Set(def.values);
    inst._zod.pattern = new RegExp(`^(${def.values
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o ? o.toString() : String(o)))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (inst._zod.values.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values: def.values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        if (def.innerType._zod.optin === "optional") {
            return def.innerType._zod.run(payload, ctx);
        }
        if (payload.value === undefined) {
            return payload;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodLazy = /*@__PURE__*/ $constructor("$ZodLazy", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "innerType", () => def.getter());
    defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
    defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
    defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin);
    defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout);
    inst._zod.parse = (payload, ctx) => {
        const inner = inst._zod.innerType;
        return inner._zod.run(payload, ctx);
    };
});

function _string(Class, params) {
    return new Class({
        type: "string",
        ...normalizeParams(),
    });
}
function _number(Class, params) {
    return new Class({
        type: "number",
        checks: [],
        ...normalizeParams(),
    });
}
function _boolean(Class, params) {
    return new Class({
        type: "boolean",
        ...normalizeParams(),
    });
}

const ZodMiniType = /*@__PURE__*/ $constructor("ZodMiniType", (inst, def) => {
    if (!inst._zod)
        throw new Error("Uninitialized schema in ZodMiniType.");
    $ZodType.init(inst, def);
    inst.def = def;
    inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
    inst.safeParse = (data, params) => safeParse(inst, data, params);
    inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
    inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
    inst.check = (...checks) => {
        return inst.clone({
            ...def,
            checks: [
                ...(def.checks ?? []),
                ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch),
            ],
        }
        // { parent: true }
        );
    };
    inst.clone = (_def, params) => clone(inst, _def, params);
    inst.brand = () => inst;
    inst.register = ((reg, meta) => {
        reg.add(inst, meta);
        return inst;
    });
});
const ZodMiniString = /*@__PURE__*/ $constructor("ZodMiniString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodMiniType.init(inst, def);
});
function string(params) {
    return _string(ZodMiniString);
}
const ZodMiniNumber = /*@__PURE__*/ $constructor("ZodMiniNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodMiniType.init(inst, def);
});
function number(params) {
    return _number(ZodMiniNumber);
}
const ZodMiniBoolean = /*@__PURE__*/ $constructor("ZodMiniBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodMiniType.init(inst, def);
});
function boolean(params) {
    return _boolean(ZodMiniBoolean);
}
const ZodMiniArray = /*@__PURE__*/ $constructor("ZodMiniArray", (inst, def) => {
    $ZodArray.init(inst, def);
    ZodMiniType.init(inst, def);
});
function array(element, params) {
    return new ZodMiniArray({
        type: "array",
        element: element,
        ...normalizeParams(),
    });
}
const ZodMiniObject = /*@__PURE__*/ $constructor("ZodMiniObject", (inst, def) => {
    $ZodObject.init(inst, def);
    ZodMiniType.init(inst, def);
    defineLazy(inst, "shape", () => def.shape);
});
function object(shape, params) {
    const def = {
        type: "object",
        get shape() {
            assignProp(this, "shape", { ...shape });
            return this.shape;
        },
        ...normalizeParams(),
    };
    return new ZodMiniObject(def);
}
const ZodMiniUnion = /*@__PURE__*/ $constructor("ZodMiniUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodMiniType.init(inst, def);
});
function union(options, params) {
    return new ZodMiniUnion({
        type: "union",
        options: options,
        ...normalizeParams(),
    });
}
const ZodMiniLiteral = /*@__PURE__*/ $constructor("ZodMiniLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodMiniType.init(inst, def);
});
function literal(value, params) {
    return new ZodMiniLiteral({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...normalizeParams(),
    });
}
const ZodMiniOptional = /*@__PURE__*/ $constructor("ZodMiniOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodMiniType.init(inst, def);
});
function optional(innerType) {
    return new ZodMiniOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodMiniLazy = /*@__PURE__*/ $constructor("ZodMiniLazy", (inst, def) => {
    $ZodLazy.init(inst, def);
    ZodMiniType.init(inst, def);
});
// export function lazy<T extends object>(getter: () => T): T {
//   return util.createTransparentProxy<T>(getter);
// }
function _lazy(getter) {
    return new ZodMiniLazy({
        type: "lazy",
        getter: getter,
    });
}

/**
 * Serializable structure that represents an option.
 */
const Option = object({
    type: literal("option"),
    disabled: optional(boolean()),
    label: string(),
    value: union([boolean(), number(), string()]),
});

/**
 * Serializable structure that represents a group of options.
 */
const OptionGroup = object({
    type: literal("option-group"),
    disabled: optional(boolean()),
    options: _lazy(() => array(union([Option, OptionGroup]))),
    label: string(),
});

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var bufferUtil = {exports: {}};

var constants;
var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;

	const BINARY_TYPES = ['nodebuffer', 'arraybuffer', 'fragments'];
	const hasBlob = typeof Blob !== 'undefined';

	if (hasBlob) BINARY_TYPES.push('blob');

	constants = {
	  BINARY_TYPES,
	  CLOSE_TIMEOUT: 30000,
	  EMPTY_BUFFER: Buffer.alloc(0),
	  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
	  hasBlob,
	  kForOnEventAttribute: Symbol('kIsForOnEventAttribute'),
	  kListener: Symbol('kListener'),
	  kStatusCode: Symbol('status-code'),
	  kWebSocket: Symbol('websocket'),
	  NOOP: () => {}
	};
	return constants;
}

var hasRequiredBufferUtil;

function requireBufferUtil () {
	if (hasRequiredBufferUtil) return bufferUtil.exports;
	hasRequiredBufferUtil = 1;

	const { EMPTY_BUFFER } = requireConstants();

	const FastBuffer = Buffer[Symbol.species];

	/**
	 * Merges an array of buffers into a new buffer.
	 *
	 * @param {Buffer[]} list The array of buffers to concat
	 * @param {Number} totalLength The total length of buffers in the list
	 * @return {Buffer} The resulting buffer
	 * @public
	 */
	function concat(list, totalLength) {
	  if (list.length === 0) return EMPTY_BUFFER;
	  if (list.length === 1) return list[0];

	  const target = Buffer.allocUnsafe(totalLength);
	  let offset = 0;

	  for (let i = 0; i < list.length; i++) {
	    const buf = list[i];
	    target.set(buf, offset);
	    offset += buf.length;
	  }

	  if (offset < totalLength) {
	    return new FastBuffer(target.buffer, target.byteOffset, offset);
	  }

	  return target;
	}

	/**
	 * Masks a buffer using the given mask.
	 *
	 * @param {Buffer} source The buffer to mask
	 * @param {Buffer} mask The mask to use
	 * @param {Buffer} output The buffer where to store the result
	 * @param {Number} offset The offset at which to start writing
	 * @param {Number} length The number of bytes to mask.
	 * @public
	 */
	function _mask(source, mask, output, offset, length) {
	  for (let i = 0; i < length; i++) {
	    output[offset + i] = source[i] ^ mask[i & 3];
	  }
	}

	/**
	 * Unmasks a buffer using the given mask.
	 *
	 * @param {Buffer} buffer The buffer to unmask
	 * @param {Buffer} mask The mask to use
	 * @public
	 */
	function _unmask(buffer, mask) {
	  for (let i = 0; i < buffer.length; i++) {
	    buffer[i] ^= mask[i & 3];
	  }
	}

	/**
	 * Converts a buffer to an `ArrayBuffer`.
	 *
	 * @param {Buffer} buf The buffer to convert
	 * @return {ArrayBuffer} Converted buffer
	 * @public
	 */
	function toArrayBuffer(buf) {
	  if (buf.length === buf.buffer.byteLength) {
	    return buf.buffer;
	  }

	  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
	}

	/**
	 * Converts `data` to a `Buffer`.
	 *
	 * @param {*} data The data to convert
	 * @return {Buffer} The buffer
	 * @throws {TypeError}
	 * @public
	 */
	function toBuffer(data) {
	  toBuffer.readOnly = true;

	  if (Buffer.isBuffer(data)) return data;

	  let buf;

	  if (data instanceof ArrayBuffer) {
	    buf = new FastBuffer(data);
	  } else if (ArrayBuffer.isView(data)) {
	    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
	  } else {
	    buf = Buffer.from(data);
	    toBuffer.readOnly = false;
	  }

	  return buf;
	}

	bufferUtil.exports = {
	  concat,
	  mask: _mask,
	  toArrayBuffer,
	  toBuffer,
	  unmask: _unmask
	};

	/* istanbul ignore else  */
	if (!process.env.WS_NO_BUFFER_UTIL) {
	  try {
	    const bufferUtil$1 = require('bufferutil');

	    bufferUtil.exports.mask = function (source, mask, output, offset, length) {
	      if (length < 48) _mask(source, mask, output, offset, length);
	      else bufferUtil$1.mask(source, mask, output, offset, length);
	    };

	    bufferUtil.exports.unmask = function (buffer, mask) {
	      if (buffer.length < 32) _unmask(buffer, mask);
	      else bufferUtil$1.unmask(buffer, mask);
	    };
	  } catch (e) {
	    // Continue regardless of the error.
	  }
	}
	return bufferUtil.exports;
}

var limiter;
var hasRequiredLimiter;

function requireLimiter () {
	if (hasRequiredLimiter) return limiter;
	hasRequiredLimiter = 1;

	const kDone = Symbol('kDone');
	const kRun = Symbol('kRun');

	/**
	 * A very simple job queue with adjustable concurrency. Adapted from
	 * https://github.com/STRML/async-limiter
	 */
	class Limiter {
	  /**
	   * Creates a new `Limiter`.
	   *
	   * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
	   *     to run concurrently
	   */
	  constructor(concurrency) {
	    this[kDone] = () => {
	      this.pending--;
	      this[kRun]();
	    };
	    this.concurrency = concurrency || Infinity;
	    this.jobs = [];
	    this.pending = 0;
	  }

	  /**
	   * Adds a job to the queue.
	   *
	   * @param {Function} job The job to run
	   * @public
	   */
	  add(job) {
	    this.jobs.push(job);
	    this[kRun]();
	  }

	  /**
	   * Removes a job from the queue and runs it if possible.
	   *
	   * @private
	   */
	  [kRun]() {
	    if (this.pending === this.concurrency) return;

	    if (this.jobs.length) {
	      const job = this.jobs.shift();

	      this.pending++;
	      job(this[kDone]);
	    }
	  }
	}

	limiter = Limiter;
	return limiter;
}

var permessageDeflate;
var hasRequiredPermessageDeflate;

function requirePermessageDeflate () {
	if (hasRequiredPermessageDeflate) return permessageDeflate;
	hasRequiredPermessageDeflate = 1;

	const zlib = require$$0$1;

	const bufferUtil = requireBufferUtil();
	const Limiter = requireLimiter();
	const { kStatusCode } = requireConstants();

	const FastBuffer = Buffer[Symbol.species];
	const TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
	const kPerMessageDeflate = Symbol('permessage-deflate');
	const kTotalLength = Symbol('total-length');
	const kCallback = Symbol('callback');
	const kBuffers = Symbol('buffers');
	const kError = Symbol('error');

	//
	// We limit zlib concurrency, which prevents severe memory fragmentation
	// as documented in https://github.com/nodejs/node/issues/8871#issuecomment-250915913
	// and https://github.com/websockets/ws/issues/1202
	//
	// Intentionally global; it's the global thread pool that's an issue.
	//
	let zlibLimiter;

	/**
	 * permessage-deflate implementation.
	 */
	class PerMessageDeflate {
	  /**
	   * Creates a PerMessageDeflate instance.
	   *
	   * @param {Object} [options] Configuration options
	   * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
	   *     for, or request, a custom client window size
	   * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
	   *     acknowledge disabling of client context takeover
	   * @param {Number} [options.concurrencyLimit=10] The number of concurrent
	   *     calls to zlib
	   * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
	   *     use of a custom server window size
	   * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
	   *     disabling of server context takeover
	   * @param {Number} [options.threshold=1024] Size (in bytes) below which
	   *     messages should not be compressed if context takeover is disabled
	   * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
	   *     deflate
	   * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
	   *     inflate
	   * @param {Boolean} [isServer=false] Create the instance in either server or
	   *     client mode
	   * @param {Number} [maxPayload=0] The maximum allowed message length
	   */
	  constructor(options, isServer, maxPayload) {
	    this._maxPayload = maxPayload | 0;
	    this._options = options || {};
	    this._threshold =
	      this._options.threshold !== undefined ? this._options.threshold : 1024;
	    this._isServer = !!isServer;
	    this._deflate = null;
	    this._inflate = null;

	    this.params = null;

	    if (!zlibLimiter) {
	      const concurrency =
	        this._options.concurrencyLimit !== undefined
	          ? this._options.concurrencyLimit
	          : 10;
	      zlibLimiter = new Limiter(concurrency);
	    }
	  }

	  /**
	   * @type {String}
	   */
	  static get extensionName() {
	    return 'permessage-deflate';
	  }

	  /**
	   * Create an extension negotiation offer.
	   *
	   * @return {Object} Extension parameters
	   * @public
	   */
	  offer() {
	    const params = {};

	    if (this._options.serverNoContextTakeover) {
	      params.server_no_context_takeover = true;
	    }
	    if (this._options.clientNoContextTakeover) {
	      params.client_no_context_takeover = true;
	    }
	    if (this._options.serverMaxWindowBits) {
	      params.server_max_window_bits = this._options.serverMaxWindowBits;
	    }
	    if (this._options.clientMaxWindowBits) {
	      params.client_max_window_bits = this._options.clientMaxWindowBits;
	    } else if (this._options.clientMaxWindowBits == null) {
	      params.client_max_window_bits = true;
	    }

	    return params;
	  }

	  /**
	   * Accept an extension negotiation offer/response.
	   *
	   * @param {Array} configurations The extension negotiation offers/reponse
	   * @return {Object} Accepted configuration
	   * @public
	   */
	  accept(configurations) {
	    configurations = this.normalizeParams(configurations);

	    this.params = this._isServer
	      ? this.acceptAsServer(configurations)
	      : this.acceptAsClient(configurations);

	    return this.params;
	  }

	  /**
	   * Releases all resources used by the extension.
	   *
	   * @public
	   */
	  cleanup() {
	    if (this._inflate) {
	      this._inflate.close();
	      this._inflate = null;
	    }

	    if (this._deflate) {
	      const callback = this._deflate[kCallback];

	      this._deflate.close();
	      this._deflate = null;

	      if (callback) {
	        callback(
	          new Error(
	            'The deflate stream was closed while data was being processed'
	          )
	        );
	      }
	    }
	  }

	  /**
	   *  Accept an extension negotiation offer.
	   *
	   * @param {Array} offers The extension negotiation offers
	   * @return {Object} Accepted configuration
	   * @private
	   */
	  acceptAsServer(offers) {
	    const opts = this._options;
	    const accepted = offers.find((params) => {
	      if (
	        (opts.serverNoContextTakeover === false &&
	          params.server_no_context_takeover) ||
	        (params.server_max_window_bits &&
	          (opts.serverMaxWindowBits === false ||
	            (typeof opts.serverMaxWindowBits === 'number' &&
	              opts.serverMaxWindowBits > params.server_max_window_bits))) ||
	        (typeof opts.clientMaxWindowBits === 'number' &&
	          !params.client_max_window_bits)
	      ) {
	        return false;
	      }

	      return true;
	    });

	    if (!accepted) {
	      throw new Error('None of the extension offers can be accepted');
	    }

	    if (opts.serverNoContextTakeover) {
	      accepted.server_no_context_takeover = true;
	    }
	    if (opts.clientNoContextTakeover) {
	      accepted.client_no_context_takeover = true;
	    }
	    if (typeof opts.serverMaxWindowBits === 'number') {
	      accepted.server_max_window_bits = opts.serverMaxWindowBits;
	    }
	    if (typeof opts.clientMaxWindowBits === 'number') {
	      accepted.client_max_window_bits = opts.clientMaxWindowBits;
	    } else if (
	      accepted.client_max_window_bits === true ||
	      opts.clientMaxWindowBits === false
	    ) {
	      delete accepted.client_max_window_bits;
	    }

	    return accepted;
	  }

	  /**
	   * Accept the extension negotiation response.
	   *
	   * @param {Array} response The extension negotiation response
	   * @return {Object} Accepted configuration
	   * @private
	   */
	  acceptAsClient(response) {
	    const params = response[0];

	    if (
	      this._options.clientNoContextTakeover === false &&
	      params.client_no_context_takeover
	    ) {
	      throw new Error('Unexpected parameter "client_no_context_takeover"');
	    }

	    if (!params.client_max_window_bits) {
	      if (typeof this._options.clientMaxWindowBits === 'number') {
	        params.client_max_window_bits = this._options.clientMaxWindowBits;
	      }
	    } else if (
	      this._options.clientMaxWindowBits === false ||
	      (typeof this._options.clientMaxWindowBits === 'number' &&
	        params.client_max_window_bits > this._options.clientMaxWindowBits)
	    ) {
	      throw new Error(
	        'Unexpected or invalid parameter "client_max_window_bits"'
	      );
	    }

	    return params;
	  }

	  /**
	   * Normalize parameters.
	   *
	   * @param {Array} configurations The extension negotiation offers/reponse
	   * @return {Array} The offers/response with normalized parameters
	   * @private
	   */
	  normalizeParams(configurations) {
	    configurations.forEach((params) => {
	      Object.keys(params).forEach((key) => {
	        let value = params[key];

	        if (value.length > 1) {
	          throw new Error(`Parameter "${key}" must have only a single value`);
	        }

	        value = value[0];

	        if (key === 'client_max_window_bits') {
	          if (value !== true) {
	            const num = +value;
	            if (!Number.isInteger(num) || num < 8 || num > 15) {
	              throw new TypeError(
	                `Invalid value for parameter "${key}": ${value}`
	              );
	            }
	            value = num;
	          } else if (!this._isServer) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	        } else if (key === 'server_max_window_bits') {
	          const num = +value;
	          if (!Number.isInteger(num) || num < 8 || num > 15) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	          value = num;
	        } else if (
	          key === 'client_no_context_takeover' ||
	          key === 'server_no_context_takeover'
	        ) {
	          if (value !== true) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	        } else {
	          throw new Error(`Unknown parameter "${key}"`);
	        }

	        params[key] = value;
	      });
	    });

	    return configurations;
	  }

	  /**
	   * Decompress data. Concurrency limited.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @public
	   */
	  decompress(data, fin, callback) {
	    zlibLimiter.add((done) => {
	      this._decompress(data, fin, (err, result) => {
	        done();
	        callback(err, result);
	      });
	    });
	  }

	  /**
	   * Compress data. Concurrency limited.
	   *
	   * @param {(Buffer|String)} data Data to compress
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @public
	   */
	  compress(data, fin, callback) {
	    zlibLimiter.add((done) => {
	      this._compress(data, fin, (err, result) => {
	        done();
	        callback(err, result);
	      });
	    });
	  }

	  /**
	   * Decompress data.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @private
	   */
	  _decompress(data, fin, callback) {
	    const endpoint = this._isServer ? 'client' : 'server';

	    if (!this._inflate) {
	      const key = `${endpoint}_max_window_bits`;
	      const windowBits =
	        typeof this.params[key] !== 'number'
	          ? zlib.Z_DEFAULT_WINDOWBITS
	          : this.params[key];

	      this._inflate = zlib.createInflateRaw({
	        ...this._options.zlibInflateOptions,
	        windowBits
	      });
	      this._inflate[kPerMessageDeflate] = this;
	      this._inflate[kTotalLength] = 0;
	      this._inflate[kBuffers] = [];
	      this._inflate.on('error', inflateOnError);
	      this._inflate.on('data', inflateOnData);
	    }

	    this._inflate[kCallback] = callback;

	    this._inflate.write(data);
	    if (fin) this._inflate.write(TRAILER);

	    this._inflate.flush(() => {
	      const err = this._inflate[kError];

	      if (err) {
	        this._inflate.close();
	        this._inflate = null;
	        callback(err);
	        return;
	      }

	      const data = bufferUtil.concat(
	        this._inflate[kBuffers],
	        this._inflate[kTotalLength]
	      );

	      if (this._inflate._readableState.endEmitted) {
	        this._inflate.close();
	        this._inflate = null;
	      } else {
	        this._inflate[kTotalLength] = 0;
	        this._inflate[kBuffers] = [];

	        if (fin && this.params[`${endpoint}_no_context_takeover`]) {
	          this._inflate.reset();
	        }
	      }

	      callback(null, data);
	    });
	  }

	  /**
	   * Compress data.
	   *
	   * @param {(Buffer|String)} data Data to compress
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @private
	   */
	  _compress(data, fin, callback) {
	    const endpoint = this._isServer ? 'server' : 'client';

	    if (!this._deflate) {
	      const key = `${endpoint}_max_window_bits`;
	      const windowBits =
	        typeof this.params[key] !== 'number'
	          ? zlib.Z_DEFAULT_WINDOWBITS
	          : this.params[key];

	      this._deflate = zlib.createDeflateRaw({
	        ...this._options.zlibDeflateOptions,
	        windowBits
	      });

	      this._deflate[kTotalLength] = 0;
	      this._deflate[kBuffers] = [];

	      this._deflate.on('data', deflateOnData);
	    }

	    this._deflate[kCallback] = callback;

	    this._deflate.write(data);
	    this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
	      if (!this._deflate) {
	        //
	        // The deflate stream was closed while data was being processed.
	        //
	        return;
	      }

	      let data = bufferUtil.concat(
	        this._deflate[kBuffers],
	        this._deflate[kTotalLength]
	      );

	      if (fin) {
	        data = new FastBuffer(data.buffer, data.byteOffset, data.length - 4);
	      }

	      //
	      // Ensure that the callback will not be called again in
	      // `PerMessageDeflate#cleanup()`.
	      //
	      this._deflate[kCallback] = null;

	      this._deflate[kTotalLength] = 0;
	      this._deflate[kBuffers] = [];

	      if (fin && this.params[`${endpoint}_no_context_takeover`]) {
	        this._deflate.reset();
	      }

	      callback(null, data);
	    });
	  }
	}

	permessageDeflate = PerMessageDeflate;

	/**
	 * The listener of the `zlib.DeflateRaw` stream `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function deflateOnData(chunk) {
	  this[kBuffers].push(chunk);
	  this[kTotalLength] += chunk.length;
	}

	/**
	 * The listener of the `zlib.InflateRaw` stream `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function inflateOnData(chunk) {
	  this[kTotalLength] += chunk.length;

	  if (
	    this[kPerMessageDeflate]._maxPayload < 1 ||
	    this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload
	  ) {
	    this[kBuffers].push(chunk);
	    return;
	  }

	  this[kError] = new RangeError('Max payload size exceeded');
	  this[kError].code = 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
	  this[kError][kStatusCode] = 1009;
	  this.removeListener('data', inflateOnData);

	  //
	  // The choice to employ `zlib.reset()` over `zlib.close()` is dictated by the
	  // fact that in Node.js versions prior to 13.10.0, the callback for
	  // `zlib.flush()` is not called if `zlib.close()` is used. Utilizing
	  // `zlib.reset()` ensures that either the callback is invoked or an error is
	  // emitted.
	  //
	  this.reset();
	}

	/**
	 * The listener of the `zlib.InflateRaw` stream `'error'` event.
	 *
	 * @param {Error} err The emitted error
	 * @private
	 */
	function inflateOnError(err) {
	  //
	  // There is no need to call `Zlib#close()` as the handle is automatically
	  // closed when an error is emitted.
	  //
	  this[kPerMessageDeflate]._inflate = null;

	  if (this[kError]) {
	    this[kCallback](this[kError]);
	    return;
	  }

	  err[kStatusCode] = 1007;
	  this[kCallback](err);
	}
	return permessageDeflate;
}

var validation$1 = {exports: {}};

var hasRequiredValidation$1;

function requireValidation$1 () {
	if (hasRequiredValidation$1) return validation$1.exports;
	hasRequiredValidation$1 = 1;

	const { isUtf8 } = require$$0$2;

	const { hasBlob } = requireConstants();

	//
	// Allowed token characters:
	//
	// '!', '#', '$', '%', '&', ''', '*', '+', '-',
	// '.', 0-9, A-Z, '^', '_', '`', a-z, '|', '~'
	//
	// tokenChars[32] === 0 // ' '
	// tokenChars[33] === 1 // '!'
	// tokenChars[34] === 0 // '"'
	// ...
	//
	// prettier-ignore
	const tokenChars = [
	  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
	  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
	  0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, // 32 - 47
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
	  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, // 80 - 95
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0 // 112 - 127
	];

	/**
	 * Checks if a status code is allowed in a close frame.
	 *
	 * @param {Number} code The status code
	 * @return {Boolean} `true` if the status code is valid, else `false`
	 * @public
	 */
	function isValidStatusCode(code) {
	  return (
	    (code >= 1000 &&
	      code <= 1014 &&
	      code !== 1004 &&
	      code !== 1005 &&
	      code !== 1006) ||
	    (code >= 3000 && code <= 4999)
	  );
	}

	/**
	 * Checks if a given buffer contains only correct UTF-8.
	 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
	 * Markus Kuhn.
	 *
	 * @param {Buffer} buf The buffer to check
	 * @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
	 * @public
	 */
	function _isValidUTF8(buf) {
	  const len = buf.length;
	  let i = 0;

	  while (i < len) {
	    if ((buf[i] & 0x80) === 0) {
	      // 0xxxxxxx
	      i++;
	    } else if ((buf[i] & 0xe0) === 0xc0) {
	      // 110xxxxx 10xxxxxx
	      if (
	        i + 1 === len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i] & 0xfe) === 0xc0 // Overlong
	      ) {
	        return false;
	      }

	      i += 2;
	    } else if ((buf[i] & 0xf0) === 0xe0) {
	      // 1110xxxx 10xxxxxx 10xxxxxx
	      if (
	        i + 2 >= len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i + 2] & 0xc0) !== 0x80 ||
	        (buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80) || // Overlong
	        (buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0) // Surrogate (U+D800 - U+DFFF)
	      ) {
	        return false;
	      }

	      i += 3;
	    } else if ((buf[i] & 0xf8) === 0xf0) {
	      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
	      if (
	        i + 3 >= len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i + 2] & 0xc0) !== 0x80 ||
	        (buf[i + 3] & 0xc0) !== 0x80 ||
	        (buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80) || // Overlong
	        (buf[i] === 0xf4 && buf[i + 1] > 0x8f) ||
	        buf[i] > 0xf4 // > U+10FFFF
	      ) {
	        return false;
	      }

	      i += 4;
	    } else {
	      return false;
	    }
	  }

	  return true;
	}

	/**
	 * Determines whether a value is a `Blob`.
	 *
	 * @param {*} value The value to be tested
	 * @return {Boolean} `true` if `value` is a `Blob`, else `false`
	 * @private
	 */
	function isBlob(value) {
	  return (
	    hasBlob &&
	    typeof value === 'object' &&
	    typeof value.arrayBuffer === 'function' &&
	    typeof value.type === 'string' &&
	    typeof value.stream === 'function' &&
	    (value[Symbol.toStringTag] === 'Blob' ||
	      value[Symbol.toStringTag] === 'File')
	  );
	}

	validation$1.exports = {
	  isBlob,
	  isValidStatusCode,
	  isValidUTF8: _isValidUTF8,
	  tokenChars
	};

	if (isUtf8) {
	  validation$1.exports.isValidUTF8 = function (buf) {
	    return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
	  };
	} /* istanbul ignore else  */ else if (!process.env.WS_NO_UTF_8_VALIDATE) {
	  try {
	    const isValidUTF8 = require('utf-8-validate');

	    validation$1.exports.isValidUTF8 = function (buf) {
	      return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
	    };
	  } catch (e) {
	    // Continue regardless of the error.
	  }
	}
	return validation$1.exports;
}

var receiver;
var hasRequiredReceiver;

function requireReceiver () {
	if (hasRequiredReceiver) return receiver;
	hasRequiredReceiver = 1;

	const { Writable } = require$$0$3;

	const PerMessageDeflate = requirePermessageDeflate();
	const {
	  BINARY_TYPES,
	  EMPTY_BUFFER,
	  kStatusCode,
	  kWebSocket
	} = requireConstants();
	const { concat, toArrayBuffer, unmask } = requireBufferUtil();
	const { isValidStatusCode, isValidUTF8 } = requireValidation$1();

	const FastBuffer = Buffer[Symbol.species];

	const GET_INFO = 0;
	const GET_PAYLOAD_LENGTH_16 = 1;
	const GET_PAYLOAD_LENGTH_64 = 2;
	const GET_MASK = 3;
	const GET_DATA = 4;
	const INFLATING = 5;
	const DEFER_EVENT = 6;

	/**
	 * HyBi Receiver implementation.
	 *
	 * @extends Writable
	 */
	class Receiver extends Writable {
	  /**
	   * Creates a Receiver instance.
	   *
	   * @param {Object} [options] Options object
	   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {String} [options.binaryType=nodebuffer] The type for binary data
	   * @param {Object} [options.extensions] An object containing the negotiated
	   *     extensions
	   * @param {Boolean} [options.isServer=false] Specifies whether to operate in
	   *     client or server mode
	   * @param {Number} [options.maxPayload=0] The maximum allowed message length
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   */
	  constructor(options = {}) {
	    super();

	    this._allowSynchronousEvents =
	      options.allowSynchronousEvents !== undefined
	        ? options.allowSynchronousEvents
	        : true;
	    this._binaryType = options.binaryType || BINARY_TYPES[0];
	    this._extensions = options.extensions || {};
	    this._isServer = !!options.isServer;
	    this._maxPayload = options.maxPayload | 0;
	    this._skipUTF8Validation = !!options.skipUTF8Validation;
	    this[kWebSocket] = undefined;

	    this._bufferedBytes = 0;
	    this._buffers = [];

	    this._compressed = false;
	    this._payloadLength = 0;
	    this._mask = undefined;
	    this._fragmented = 0;
	    this._masked = false;
	    this._fin = false;
	    this._opcode = 0;

	    this._totalPayloadLength = 0;
	    this._messageLength = 0;
	    this._fragments = [];

	    this._errored = false;
	    this._loop = false;
	    this._state = GET_INFO;
	  }

	  /**
	   * Implements `Writable.prototype._write()`.
	   *
	   * @param {Buffer} chunk The chunk of data to write
	   * @param {String} encoding The character encoding of `chunk`
	   * @param {Function} cb Callback
	   * @private
	   */
	  _write(chunk, encoding, cb) {
	    if (this._opcode === 0x08 && this._state == GET_INFO) return cb();

	    this._bufferedBytes += chunk.length;
	    this._buffers.push(chunk);
	    this.startLoop(cb);
	  }

	  /**
	   * Consumes `n` bytes from the buffered data.
	   *
	   * @param {Number} n The number of bytes to consume
	   * @return {Buffer} The consumed bytes
	   * @private
	   */
	  consume(n) {
	    this._bufferedBytes -= n;

	    if (n === this._buffers[0].length) return this._buffers.shift();

	    if (n < this._buffers[0].length) {
	      const buf = this._buffers[0];
	      this._buffers[0] = new FastBuffer(
	        buf.buffer,
	        buf.byteOffset + n,
	        buf.length - n
	      );

	      return new FastBuffer(buf.buffer, buf.byteOffset, n);
	    }

	    const dst = Buffer.allocUnsafe(n);

	    do {
	      const buf = this._buffers[0];
	      const offset = dst.length - n;

	      if (n >= buf.length) {
	        dst.set(this._buffers.shift(), offset);
	      } else {
	        dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
	        this._buffers[0] = new FastBuffer(
	          buf.buffer,
	          buf.byteOffset + n,
	          buf.length - n
	        );
	      }

	      n -= buf.length;
	    } while (n > 0);

	    return dst;
	  }

	  /**
	   * Starts the parsing loop.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  startLoop(cb) {
	    this._loop = true;

	    do {
	      switch (this._state) {
	        case GET_INFO:
	          this.getInfo(cb);
	          break;
	        case GET_PAYLOAD_LENGTH_16:
	          this.getPayloadLength16(cb);
	          break;
	        case GET_PAYLOAD_LENGTH_64:
	          this.getPayloadLength64(cb);
	          break;
	        case GET_MASK:
	          this.getMask();
	          break;
	        case GET_DATA:
	          this.getData(cb);
	          break;
	        case INFLATING:
	        case DEFER_EVENT:
	          this._loop = false;
	          return;
	      }
	    } while (this._loop);

	    if (!this._errored) cb();
	  }

	  /**
	   * Reads the first two bytes of a frame.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getInfo(cb) {
	    if (this._bufferedBytes < 2) {
	      this._loop = false;
	      return;
	    }

	    const buf = this.consume(2);

	    if ((buf[0] & 0x30) !== 0x00) {
	      const error = this.createError(
	        RangeError,
	        'RSV2 and RSV3 must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_RSV_2_3'
	      );

	      cb(error);
	      return;
	    }

	    const compressed = (buf[0] & 0x40) === 0x40;

	    if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
	      const error = this.createError(
	        RangeError,
	        'RSV1 must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_RSV_1'
	      );

	      cb(error);
	      return;
	    }

	    this._fin = (buf[0] & 0x80) === 0x80;
	    this._opcode = buf[0] & 0x0f;
	    this._payloadLength = buf[1] & 0x7f;

	    if (this._opcode === 0x00) {
	      if (compressed) {
	        const error = this.createError(
	          RangeError,
	          'RSV1 must be clear',
	          true,
	          1002,
	          'WS_ERR_UNEXPECTED_RSV_1'
	        );

	        cb(error);
	        return;
	      }

	      if (!this._fragmented) {
	        const error = this.createError(
	          RangeError,
	          'invalid opcode 0',
	          true,
	          1002,
	          'WS_ERR_INVALID_OPCODE'
	        );

	        cb(error);
	        return;
	      }

	      this._opcode = this._fragmented;
	    } else if (this._opcode === 0x01 || this._opcode === 0x02) {
	      if (this._fragmented) {
	        const error = this.createError(
	          RangeError,
	          `invalid opcode ${this._opcode}`,
	          true,
	          1002,
	          'WS_ERR_INVALID_OPCODE'
	        );

	        cb(error);
	        return;
	      }

	      this._compressed = compressed;
	    } else if (this._opcode > 0x07 && this._opcode < 0x0b) {
	      if (!this._fin) {
	        const error = this.createError(
	          RangeError,
	          'FIN must be set',
	          true,
	          1002,
	          'WS_ERR_EXPECTED_FIN'
	        );

	        cb(error);
	        return;
	      }

	      if (compressed) {
	        const error = this.createError(
	          RangeError,
	          'RSV1 must be clear',
	          true,
	          1002,
	          'WS_ERR_UNEXPECTED_RSV_1'
	        );

	        cb(error);
	        return;
	      }

	      if (
	        this._payloadLength > 0x7d ||
	        (this._opcode === 0x08 && this._payloadLength === 1)
	      ) {
	        const error = this.createError(
	          RangeError,
	          `invalid payload length ${this._payloadLength}`,
	          true,
	          1002,
	          'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH'
	        );

	        cb(error);
	        return;
	      }
	    } else {
	      const error = this.createError(
	        RangeError,
	        `invalid opcode ${this._opcode}`,
	        true,
	        1002,
	        'WS_ERR_INVALID_OPCODE'
	      );

	      cb(error);
	      return;
	    }

	    if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
	    this._masked = (buf[1] & 0x80) === 0x80;

	    if (this._isServer) {
	      if (!this._masked) {
	        const error = this.createError(
	          RangeError,
	          'MASK must be set',
	          true,
	          1002,
	          'WS_ERR_EXPECTED_MASK'
	        );

	        cb(error);
	        return;
	      }
	    } else if (this._masked) {
	      const error = this.createError(
	        RangeError,
	        'MASK must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_MASK'
	      );

	      cb(error);
	      return;
	    }

	    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
	    else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
	    else this.haveLength(cb);
	  }

	  /**
	   * Gets extended payload length (7+16).
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getPayloadLength16(cb) {
	    if (this._bufferedBytes < 2) {
	      this._loop = false;
	      return;
	    }

	    this._payloadLength = this.consume(2).readUInt16BE(0);
	    this.haveLength(cb);
	  }

	  /**
	   * Gets extended payload length (7+64).
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getPayloadLength64(cb) {
	    if (this._bufferedBytes < 8) {
	      this._loop = false;
	      return;
	    }

	    const buf = this.consume(8);
	    const num = buf.readUInt32BE(0);

	    //
	    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
	    // if payload length is greater than this number.
	    //
	    if (num > Math.pow(2, 53 - 32) - 1) {
	      const error = this.createError(
	        RangeError,
	        'Unsupported WebSocket frame: payload length > 2^53 - 1',
	        false,
	        1009,
	        'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH'
	      );

	      cb(error);
	      return;
	    }

	    this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
	    this.haveLength(cb);
	  }

	  /**
	   * Payload length has been read.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  haveLength(cb) {
	    if (this._payloadLength && this._opcode < 0x08) {
	      this._totalPayloadLength += this._payloadLength;
	      if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
	        const error = this.createError(
	          RangeError,
	          'Max payload size exceeded',
	          false,
	          1009,
	          'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
	        );

	        cb(error);
	        return;
	      }
	    }

	    if (this._masked) this._state = GET_MASK;
	    else this._state = GET_DATA;
	  }

	  /**
	   * Reads mask bytes.
	   *
	   * @private
	   */
	  getMask() {
	    if (this._bufferedBytes < 4) {
	      this._loop = false;
	      return;
	    }

	    this._mask = this.consume(4);
	    this._state = GET_DATA;
	  }

	  /**
	   * Reads data bytes.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getData(cb) {
	    let data = EMPTY_BUFFER;

	    if (this._payloadLength) {
	      if (this._bufferedBytes < this._payloadLength) {
	        this._loop = false;
	        return;
	      }

	      data = this.consume(this._payloadLength);

	      if (
	        this._masked &&
	        (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0
	      ) {
	        unmask(data, this._mask);
	      }
	    }

	    if (this._opcode > 0x07) {
	      this.controlMessage(data, cb);
	      return;
	    }

	    if (this._compressed) {
	      this._state = INFLATING;
	      this.decompress(data, cb);
	      return;
	    }

	    if (data.length) {
	      //
	      // This message is not compressed so its length is the sum of the payload
	      // length of all fragments.
	      //
	      this._messageLength = this._totalPayloadLength;
	      this._fragments.push(data);
	    }

	    this.dataMessage(cb);
	  }

	  /**
	   * Decompresses data.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Function} cb Callback
	   * @private
	   */
	  decompress(data, cb) {
	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

	    perMessageDeflate.decompress(data, this._fin, (err, buf) => {
	      if (err) return cb(err);

	      if (buf.length) {
	        this._messageLength += buf.length;
	        if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
	          const error = this.createError(
	            RangeError,
	            'Max payload size exceeded',
	            false,
	            1009,
	            'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
	          );

	          cb(error);
	          return;
	        }

	        this._fragments.push(buf);
	      }

	      this.dataMessage(cb);
	      if (this._state === GET_INFO) this.startLoop(cb);
	    });
	  }

	  /**
	   * Handles a data message.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  dataMessage(cb) {
	    if (!this._fin) {
	      this._state = GET_INFO;
	      return;
	    }

	    const messageLength = this._messageLength;
	    const fragments = this._fragments;

	    this._totalPayloadLength = 0;
	    this._messageLength = 0;
	    this._fragmented = 0;
	    this._fragments = [];

	    if (this._opcode === 2) {
	      let data;

	      if (this._binaryType === 'nodebuffer') {
	        data = concat(fragments, messageLength);
	      } else if (this._binaryType === 'arraybuffer') {
	        data = toArrayBuffer(concat(fragments, messageLength));
	      } else if (this._binaryType === 'blob') {
	        data = new Blob(fragments);
	      } else {
	        data = fragments;
	      }

	      if (this._allowSynchronousEvents) {
	        this.emit('message', data, true);
	        this._state = GET_INFO;
	      } else {
	        this._state = DEFER_EVENT;
	        setImmediate(() => {
	          this.emit('message', data, true);
	          this._state = GET_INFO;
	          this.startLoop(cb);
	        });
	      }
	    } else {
	      const buf = concat(fragments, messageLength);

	      if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
	        const error = this.createError(
	          Error,
	          'invalid UTF-8 sequence',
	          true,
	          1007,
	          'WS_ERR_INVALID_UTF8'
	        );

	        cb(error);
	        return;
	      }

	      if (this._state === INFLATING || this._allowSynchronousEvents) {
	        this.emit('message', buf, false);
	        this._state = GET_INFO;
	      } else {
	        this._state = DEFER_EVENT;
	        setImmediate(() => {
	          this.emit('message', buf, false);
	          this._state = GET_INFO;
	          this.startLoop(cb);
	        });
	      }
	    }
	  }

	  /**
	   * Handles a control message.
	   *
	   * @param {Buffer} data Data to handle
	   * @return {(Error|RangeError|undefined)} A possible error
	   * @private
	   */
	  controlMessage(data, cb) {
	    if (this._opcode === 0x08) {
	      if (data.length === 0) {
	        this._loop = false;
	        this.emit('conclude', 1005, EMPTY_BUFFER);
	        this.end();
	      } else {
	        const code = data.readUInt16BE(0);

	        if (!isValidStatusCode(code)) {
	          const error = this.createError(
	            RangeError,
	            `invalid status code ${code}`,
	            true,
	            1002,
	            'WS_ERR_INVALID_CLOSE_CODE'
	          );

	          cb(error);
	          return;
	        }

	        const buf = new FastBuffer(
	          data.buffer,
	          data.byteOffset + 2,
	          data.length - 2
	        );

	        if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
	          const error = this.createError(
	            Error,
	            'invalid UTF-8 sequence',
	            true,
	            1007,
	            'WS_ERR_INVALID_UTF8'
	          );

	          cb(error);
	          return;
	        }

	        this._loop = false;
	        this.emit('conclude', code, buf);
	        this.end();
	      }

	      this._state = GET_INFO;
	      return;
	    }

	    if (this._allowSynchronousEvents) {
	      this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
	      this._state = GET_INFO;
	    } else {
	      this._state = DEFER_EVENT;
	      setImmediate(() => {
	        this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
	        this._state = GET_INFO;
	        this.startLoop(cb);
	      });
	    }
	  }

	  /**
	   * Builds an error object.
	   *
	   * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
	   * @param {String} message The error message
	   * @param {Boolean} prefix Specifies whether or not to add a default prefix to
	   *     `message`
	   * @param {Number} statusCode The status code
	   * @param {String} errorCode The exposed error code
	   * @return {(Error|RangeError)} The error
	   * @private
	   */
	  createError(ErrorCtor, message, prefix, statusCode, errorCode) {
	    this._loop = false;
	    this._errored = true;

	    const err = new ErrorCtor(
	      prefix ? `Invalid WebSocket frame: ${message}` : message
	    );

	    Error.captureStackTrace(err, this.createError);
	    err.code = errorCode;
	    err[kStatusCode] = statusCode;
	    return err;
	  }
	}

	receiver = Receiver;
	return receiver;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex" }] */

var sender;
var hasRequiredSender;

function requireSender () {
	if (hasRequiredSender) return sender;
	hasRequiredSender = 1;

	const { Duplex } = require$$0$3;
	const { randomFillSync } = require$$1$1;

	const PerMessageDeflate = requirePermessageDeflate();
	const { EMPTY_BUFFER, kWebSocket, NOOP } = requireConstants();
	const { isBlob, isValidStatusCode } = requireValidation$1();
	const { mask: applyMask, toBuffer } = requireBufferUtil();

	const kByteLength = Symbol('kByteLength');
	const maskBuffer = Buffer.alloc(4);
	const RANDOM_POOL_SIZE = 8 * 1024;
	let randomPool;
	let randomPoolPointer = RANDOM_POOL_SIZE;

	const DEFAULT = 0;
	const DEFLATING = 1;
	const GET_BLOB_DATA = 2;

	/**
	 * HyBi Sender implementation.
	 */
	class Sender {
	  /**
	   * Creates a Sender instance.
	   *
	   * @param {Duplex} socket The connection socket
	   * @param {Object} [extensions] An object containing the negotiated extensions
	   * @param {Function} [generateMask] The function used to generate the masking
	   *     key
	   */
	  constructor(socket, extensions, generateMask) {
	    this._extensions = extensions || {};

	    if (generateMask) {
	      this._generateMask = generateMask;
	      this._maskBuffer = Buffer.alloc(4);
	    }

	    this._socket = socket;

	    this._firstFragment = true;
	    this._compress = false;

	    this._bufferedBytes = 0;
	    this._queue = [];
	    this._state = DEFAULT;
	    this.onerror = NOOP;
	    this[kWebSocket] = undefined;
	  }

	  /**
	   * Frames a piece of data according to the HyBi WebSocket protocol.
	   *
	   * @param {(Buffer|String)} data The data to frame
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @return {(Buffer|String)[]} The framed data
	   * @public
	   */
	  static frame(data, options) {
	    let mask;
	    let merge = false;
	    let offset = 2;
	    let skipMasking = false;

	    if (options.mask) {
	      mask = options.maskBuffer || maskBuffer;

	      if (options.generateMask) {
	        options.generateMask(mask);
	      } else {
	        if (randomPoolPointer === RANDOM_POOL_SIZE) {
	          /* istanbul ignore else  */
	          if (randomPool === undefined) {
	            //
	            // This is lazily initialized because server-sent frames must not
	            // be masked so it may never be used.
	            //
	            randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
	          }

	          randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
	          randomPoolPointer = 0;
	        }

	        mask[0] = randomPool[randomPoolPointer++];
	        mask[1] = randomPool[randomPoolPointer++];
	        mask[2] = randomPool[randomPoolPointer++];
	        mask[3] = randomPool[randomPoolPointer++];
	      }

	      skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
	      offset = 6;
	    }

	    let dataLength;

	    if (typeof data === 'string') {
	      if (
	        (!options.mask || skipMasking) &&
	        options[kByteLength] !== undefined
	      ) {
	        dataLength = options[kByteLength];
	      } else {
	        data = Buffer.from(data);
	        dataLength = data.length;
	      }
	    } else {
	      dataLength = data.length;
	      merge = options.mask && options.readOnly && !skipMasking;
	    }

	    let payloadLength = dataLength;

	    if (dataLength >= 65536) {
	      offset += 8;
	      payloadLength = 127;
	    } else if (dataLength > 125) {
	      offset += 2;
	      payloadLength = 126;
	    }

	    const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);

	    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
	    if (options.rsv1) target[0] |= 0x40;

	    target[1] = payloadLength;

	    if (payloadLength === 126) {
	      target.writeUInt16BE(dataLength, 2);
	    } else if (payloadLength === 127) {
	      target[2] = target[3] = 0;
	      target.writeUIntBE(dataLength, 4, 6);
	    }

	    if (!options.mask) return [target, data];

	    target[1] |= 0x80;
	    target[offset - 4] = mask[0];
	    target[offset - 3] = mask[1];
	    target[offset - 2] = mask[2];
	    target[offset - 1] = mask[3];

	    if (skipMasking) return [target, data];

	    if (merge) {
	      applyMask(data, mask, target, offset, dataLength);
	      return [target];
	    }

	    applyMask(data, mask, data, 0, dataLength);
	    return [target, data];
	  }

	  /**
	   * Sends a close message to the other peer.
	   *
	   * @param {Number} [code] The status code component of the body
	   * @param {(String|Buffer)} [data] The message component of the body
	   * @param {Boolean} [mask=false] Specifies whether or not to mask the message
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  close(code, data, mask, cb) {
	    let buf;

	    if (code === undefined) {
	      buf = EMPTY_BUFFER;
	    } else if (typeof code !== 'number' || !isValidStatusCode(code)) {
	      throw new TypeError('First argument must be a valid error code number');
	    } else if (data === undefined || !data.length) {
	      buf = Buffer.allocUnsafe(2);
	      buf.writeUInt16BE(code, 0);
	    } else {
	      const length = Buffer.byteLength(data);

	      if (length > 123) {
	        throw new RangeError('The message must not be greater than 123 bytes');
	      }

	      buf = Buffer.allocUnsafe(2 + length);
	      buf.writeUInt16BE(code, 0);

	      if (typeof data === 'string') {
	        buf.write(data, 2);
	      } else {
	        buf.set(data, 2);
	      }
	    }

	    const options = {
	      [kByteLength]: buf.length,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x08,
	      readOnly: false,
	      rsv1: false
	    };

	    if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, buf, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(buf, options), cb);
	    }
	  }

	  /**
	   * Sends a ping message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  ping(data, mask, cb) {
	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (byteLength > 125) {
	      throw new RangeError('The data size must not be greater than 125 bytes');
	    }

	    const options = {
	      [kByteLength]: byteLength,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x09,
	      readOnly,
	      rsv1: false
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, false, options, cb]);
	      } else {
	        this.getBlobData(data, false, options, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(data, options), cb);
	    }
	  }

	  /**
	   * Sends a pong message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  pong(data, mask, cb) {
	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (byteLength > 125) {
	      throw new RangeError('The data size must not be greater than 125 bytes');
	    }

	    const options = {
	      [kByteLength]: byteLength,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x0a,
	      readOnly,
	      rsv1: false
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, false, options, cb]);
	      } else {
	        this.getBlobData(data, false, options, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(data, options), cb);
	    }
	  }

	  /**
	   * Sends a data message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Object} options Options object
	   * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
	   *     or text
	   * @param {Boolean} [options.compress=false] Specifies whether or not to
	   *     compress `data`
	   * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
	   *     last one
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  send(data, options, cb) {
	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
	    let opcode = options.binary ? 2 : 1;
	    let rsv1 = options.compress;

	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (this._firstFragment) {
	      this._firstFragment = false;
	      if (
	        rsv1 &&
	        perMessageDeflate &&
	        perMessageDeflate.params[
	          perMessageDeflate._isServer
	            ? 'server_no_context_takeover'
	            : 'client_no_context_takeover'
	        ]
	      ) {
	        rsv1 = byteLength >= perMessageDeflate._threshold;
	      }
	      this._compress = rsv1;
	    } else {
	      rsv1 = false;
	      opcode = 0;
	    }

	    if (options.fin) this._firstFragment = true;

	    const opts = {
	      [kByteLength]: byteLength,
	      fin: options.fin,
	      generateMask: this._generateMask,
	      mask: options.mask,
	      maskBuffer: this._maskBuffer,
	      opcode,
	      readOnly,
	      rsv1
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
	      } else {
	        this.getBlobData(data, this._compress, opts, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, this._compress, opts, cb]);
	    } else {
	      this.dispatch(data, this._compress, opts, cb);
	    }
	  }

	  /**
	   * Gets the contents of a blob as binary data.
	   *
	   * @param {Blob} blob The blob
	   * @param {Boolean} [compress=false] Specifies whether or not to compress
	   *     the data
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  getBlobData(blob, compress, options, cb) {
	    this._bufferedBytes += options[kByteLength];
	    this._state = GET_BLOB_DATA;

	    blob
	      .arrayBuffer()
	      .then((arrayBuffer) => {
	        if (this._socket.destroyed) {
	          const err = new Error(
	            'The socket was closed while the blob was being read'
	          );

	          //
	          // `callCallbacks` is called in the next tick to ensure that errors
	          // that might be thrown in the callbacks behave like errors thrown
	          // outside the promise chain.
	          //
	          process.nextTick(callCallbacks, this, err, cb);
	          return;
	        }

	        this._bufferedBytes -= options[kByteLength];
	        const data = toBuffer(arrayBuffer);

	        if (!compress) {
	          this._state = DEFAULT;
	          this.sendFrame(Sender.frame(data, options), cb);
	          this.dequeue();
	        } else {
	          this.dispatch(data, compress, options, cb);
	        }
	      })
	      .catch((err) => {
	        //
	        // `onError` is called in the next tick for the same reason that
	        // `callCallbacks` above is.
	        //
	        process.nextTick(onError, this, err, cb);
	      });
	  }

	  /**
	   * Dispatches a message.
	   *
	   * @param {(Buffer|String)} data The message to send
	   * @param {Boolean} [compress=false] Specifies whether or not to compress
	   *     `data`
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  dispatch(data, compress, options, cb) {
	    if (!compress) {
	      this.sendFrame(Sender.frame(data, options), cb);
	      return;
	    }

	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

	    this._bufferedBytes += options[kByteLength];
	    this._state = DEFLATING;
	    perMessageDeflate.compress(data, options.fin, (_, buf) => {
	      if (this._socket.destroyed) {
	        const err = new Error(
	          'The socket was closed while data was being compressed'
	        );

	        callCallbacks(this, err, cb);
	        return;
	      }

	      this._bufferedBytes -= options[kByteLength];
	      this._state = DEFAULT;
	      options.readOnly = false;
	      this.sendFrame(Sender.frame(buf, options), cb);
	      this.dequeue();
	    });
	  }

	  /**
	   * Executes queued send operations.
	   *
	   * @private
	   */
	  dequeue() {
	    while (this._state === DEFAULT && this._queue.length) {
	      const params = this._queue.shift();

	      this._bufferedBytes -= params[3][kByteLength];
	      Reflect.apply(params[0], this, params.slice(1));
	    }
	  }

	  /**
	   * Enqueues a send operation.
	   *
	   * @param {Array} params Send operation parameters.
	   * @private
	   */
	  enqueue(params) {
	    this._bufferedBytes += params[3][kByteLength];
	    this._queue.push(params);
	  }

	  /**
	   * Sends a frame.
	   *
	   * @param {(Buffer | String)[]} list The frame to send
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  sendFrame(list, cb) {
	    if (list.length === 2) {
	      this._socket.cork();
	      this._socket.write(list[0]);
	      this._socket.write(list[1], cb);
	      this._socket.uncork();
	    } else {
	      this._socket.write(list[0], cb);
	    }
	  }
	}

	sender = Sender;

	/**
	 * Calls queued callbacks with an error.
	 *
	 * @param {Sender} sender The `Sender` instance
	 * @param {Error} err The error to call the callbacks with
	 * @param {Function} [cb] The first callback
	 * @private
	 */
	function callCallbacks(sender, err, cb) {
	  if (typeof cb === 'function') cb(err);

	  for (let i = 0; i < sender._queue.length; i++) {
	    const params = sender._queue[i];
	    const callback = params[params.length - 1];

	    if (typeof callback === 'function') callback(err);
	  }
	}

	/**
	 * Handles a `Sender` error.
	 *
	 * @param {Sender} sender The `Sender` instance
	 * @param {Error} err The error
	 * @param {Function} [cb] The first pending callback
	 * @private
	 */
	function onError(sender, err, cb) {
	  callCallbacks(sender, err, cb);
	  sender.onerror(err);
	}
	return sender;
}

var eventTarget;
var hasRequiredEventTarget;

function requireEventTarget () {
	if (hasRequiredEventTarget) return eventTarget;
	hasRequiredEventTarget = 1;

	const { kForOnEventAttribute, kListener } = requireConstants();

	const kCode = Symbol('kCode');
	const kData = Symbol('kData');
	const kError = Symbol('kError');
	const kMessage = Symbol('kMessage');
	const kReason = Symbol('kReason');
	const kTarget = Symbol('kTarget');
	const kType = Symbol('kType');
	const kWasClean = Symbol('kWasClean');

	/**
	 * Class representing an event.
	 */
	class Event {
	  /**
	   * Create a new `Event`.
	   *
	   * @param {String} type The name of the event
	   * @throws {TypeError} If the `type` argument is not specified
	   */
	  constructor(type) {
	    this[kTarget] = null;
	    this[kType] = type;
	  }

	  /**
	   * @type {*}
	   */
	  get target() {
	    return this[kTarget];
	  }

	  /**
	   * @type {String}
	   */
	  get type() {
	    return this[kType];
	  }
	}

	Object.defineProperty(Event.prototype, 'target', { enumerable: true });
	Object.defineProperty(Event.prototype, 'type', { enumerable: true });

	/**
	 * Class representing a close event.
	 *
	 * @extends Event
	 */
	class CloseEvent extends Event {
	  /**
	   * Create a new `CloseEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {Number} [options.code=0] The status code explaining why the
	   *     connection was closed
	   * @param {String} [options.reason=''] A human-readable string explaining why
	   *     the connection was closed
	   * @param {Boolean} [options.wasClean=false] Indicates whether or not the
	   *     connection was cleanly closed
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kCode] = options.code === undefined ? 0 : options.code;
	    this[kReason] = options.reason === undefined ? '' : options.reason;
	    this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
	  }

	  /**
	   * @type {Number}
	   */
	  get code() {
	    return this[kCode];
	  }

	  /**
	   * @type {String}
	   */
	  get reason() {
	    return this[kReason];
	  }

	  /**
	   * @type {Boolean}
	   */
	  get wasClean() {
	    return this[kWasClean];
	  }
	}

	Object.defineProperty(CloseEvent.prototype, 'code', { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, 'reason', { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, 'wasClean', { enumerable: true });

	/**
	 * Class representing an error event.
	 *
	 * @extends Event
	 */
	class ErrorEvent extends Event {
	  /**
	   * Create a new `ErrorEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {*} [options.error=null] The error that generated this event
	   * @param {String} [options.message=''] The error message
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kError] = options.error === undefined ? null : options.error;
	    this[kMessage] = options.message === undefined ? '' : options.message;
	  }

	  /**
	   * @type {*}
	   */
	  get error() {
	    return this[kError];
	  }

	  /**
	   * @type {String}
	   */
	  get message() {
	    return this[kMessage];
	  }
	}

	Object.defineProperty(ErrorEvent.prototype, 'error', { enumerable: true });
	Object.defineProperty(ErrorEvent.prototype, 'message', { enumerable: true });

	/**
	 * Class representing a message event.
	 *
	 * @extends Event
	 */
	class MessageEvent extends Event {
	  /**
	   * Create a new `MessageEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {*} [options.data=null] The message content
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kData] = options.data === undefined ? null : options.data;
	  }

	  /**
	   * @type {*}
	   */
	  get data() {
	    return this[kData];
	  }
	}

	Object.defineProperty(MessageEvent.prototype, 'data', { enumerable: true });

	/**
	 * This provides methods for emulating the `EventTarget` interface. It's not
	 * meant to be used directly.
	 *
	 * @mixin
	 */
	const EventTarget = {
	  /**
	   * Register an event listener.
	   *
	   * @param {String} type A string representing the event type to listen for
	   * @param {(Function|Object)} handler The listener to add
	   * @param {Object} [options] An options object specifies characteristics about
	   *     the event listener
	   * @param {Boolean} [options.once=false] A `Boolean` indicating that the
	   *     listener should be invoked at most once after being added. If `true`,
	   *     the listener would be automatically removed when invoked.
	   * @public
	   */
	  addEventListener(type, handler, options = {}) {
	    for (const listener of this.listeners(type)) {
	      if (
	        !options[kForOnEventAttribute] &&
	        listener[kListener] === handler &&
	        !listener[kForOnEventAttribute]
	      ) {
	        return;
	      }
	    }

	    let wrapper;

	    if (type === 'message') {
	      wrapper = function onMessage(data, isBinary) {
	        const event = new MessageEvent('message', {
	          data: isBinary ? data : data.toString()
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'close') {
	      wrapper = function onClose(code, message) {
	        const event = new CloseEvent('close', {
	          code,
	          reason: message.toString(),
	          wasClean: this._closeFrameReceived && this._closeFrameSent
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'error') {
	      wrapper = function onError(error) {
	        const event = new ErrorEvent('error', {
	          error,
	          message: error.message
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'open') {
	      wrapper = function onOpen() {
	        const event = new Event('open');

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else {
	      return;
	    }

	    wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
	    wrapper[kListener] = handler;

	    if (options.once) {
	      this.once(type, wrapper);
	    } else {
	      this.on(type, wrapper);
	    }
	  },

	  /**
	   * Remove an event listener.
	   *
	   * @param {String} type A string representing the event type to remove
	   * @param {(Function|Object)} handler The listener to remove
	   * @public
	   */
	  removeEventListener(type, handler) {
	    for (const listener of this.listeners(type)) {
	      if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
	        this.removeListener(type, listener);
	        break;
	      }
	    }
	  }
	};

	eventTarget = {
	  CloseEvent,
	  ErrorEvent,
	  Event,
	  EventTarget,
	  MessageEvent
	};

	/**
	 * Call an event listener
	 *
	 * @param {(Function|Object)} listener The listener to call
	 * @param {*} thisArg The value to use as `this`` when calling the listener
	 * @param {Event} event The event to pass to the listener
	 * @private
	 */
	function callListener(listener, thisArg, event) {
	  if (typeof listener === 'object' && listener.handleEvent) {
	    listener.handleEvent.call(listener, event);
	  } else {
	    listener.call(thisArg, event);
	  }
	}
	return eventTarget;
}

var extension;
var hasRequiredExtension;

function requireExtension () {
	if (hasRequiredExtension) return extension;
	hasRequiredExtension = 1;

	const { tokenChars } = requireValidation$1();

	/**
	 * Adds an offer to the map of extension offers or a parameter to the map of
	 * parameters.
	 *
	 * @param {Object} dest The map of extension offers or parameters
	 * @param {String} name The extension or parameter name
	 * @param {(Object|Boolean|String)} elem The extension parameters or the
	 *     parameter value
	 * @private
	 */
	function push(dest, name, elem) {
	  if (dest[name] === undefined) dest[name] = [elem];
	  else dest[name].push(elem);
	}

	/**
	 * Parses the `Sec-WebSocket-Extensions` header into an object.
	 *
	 * @param {String} header The field value of the header
	 * @return {Object} The parsed object
	 * @public
	 */
	function parse(header) {
	  const offers = Object.create(null);
	  let params = Object.create(null);
	  let mustUnescape = false;
	  let isEscaping = false;
	  let inQuotes = false;
	  let extensionName;
	  let paramName;
	  let start = -1;
	  let code = -1;
	  let end = -1;
	  let i = 0;

	  for (; i < header.length; i++) {
	    code = header.charCodeAt(i);

	    if (extensionName === undefined) {
	      if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (
	        i !== 0 &&
	        (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */
	      ) {
	        if (end === -1 && start !== -1) end = i;
	      } else if (code === 0x3b /* ';' */ || code === 0x2c /* ',' */) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        const name = header.slice(start, end);
	        if (code === 0x2c) {
	          push(offers, name, params);
	          params = Object.create(null);
	        } else {
	          extensionName = name;
	        }

	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    } else if (paramName === undefined) {
	      if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (code === 0x20 || code === 0x09) {
	        if (end === -1 && start !== -1) end = i;
	      } else if (code === 0x3b || code === 0x2c) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        push(params, header.slice(start, end), true);
	        if (code === 0x2c) {
	          push(offers, extensionName, params);
	          params = Object.create(null);
	          extensionName = undefined;
	        }

	        start = end = -1;
	      } else if (code === 0x3d /* '=' */ && start !== -1 && end === -1) {
	        paramName = header.slice(start, i);
	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    } else {
	      //
	      // The value of a quoted-string after unescaping must conform to the
	      // token ABNF, so only token characters are valid.
	      // Ref: https://tools.ietf.org/html/rfc6455#section-9.1
	      //
	      if (isEscaping) {
	        if (tokenChars[code] !== 1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }
	        if (start === -1) start = i;
	        else if (!mustUnescape) mustUnescape = true;
	        isEscaping = false;
	      } else if (inQuotes) {
	        if (tokenChars[code] === 1) {
	          if (start === -1) start = i;
	        } else if (code === 0x22 /* '"' */ && start !== -1) {
	          inQuotes = false;
	          end = i;
	        } else if (code === 0x5c /* '\' */) {
	          isEscaping = true;
	        } else {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }
	      } else if (code === 0x22 && header.charCodeAt(i - 1) === 0x3d) {
	        inQuotes = true;
	      } else if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (start !== -1 && (code === 0x20 || code === 0x09)) {
	        if (end === -1) end = i;
	      } else if (code === 0x3b || code === 0x2c) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        let value = header.slice(start, end);
	        if (mustUnescape) {
	          value = value.replace(/\\/g, '');
	          mustUnescape = false;
	        }
	        push(params, paramName, value);
	        if (code === 0x2c) {
	          push(offers, extensionName, params);
	          params = Object.create(null);
	          extensionName = undefined;
	        }

	        paramName = undefined;
	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    }
	  }

	  if (start === -1 || inQuotes || code === 0x20 || code === 0x09) {
	    throw new SyntaxError('Unexpected end of input');
	  }

	  if (end === -1) end = i;
	  const token = header.slice(start, end);
	  if (extensionName === undefined) {
	    push(offers, token, params);
	  } else {
	    if (paramName === undefined) {
	      push(params, token, true);
	    } else if (mustUnescape) {
	      push(params, paramName, token.replace(/\\/g, ''));
	    } else {
	      push(params, paramName, token);
	    }
	    push(offers, extensionName, params);
	  }

	  return offers;
	}

	/**
	 * Builds the `Sec-WebSocket-Extensions` header field value.
	 *
	 * @param {Object} extensions The map of extensions and parameters to format
	 * @return {String} A string representing the given object
	 * @public
	 */
	function format(extensions) {
	  return Object.keys(extensions)
	    .map((extension) => {
	      let configurations = extensions[extension];
	      if (!Array.isArray(configurations)) configurations = [configurations];
	      return configurations
	        .map((params) => {
	          return [extension]
	            .concat(
	              Object.keys(params).map((k) => {
	                let values = params[k];
	                if (!Array.isArray(values)) values = [values];
	                return values
	                  .map((v) => (v === true ? k : `${k}=${v}`))
	                  .join('; ');
	              })
	            )
	            .join('; ');
	        })
	        .join(', ');
	    })
	    .join(', ');
	}

	extension = { format, parse };
	return extension;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex|Readable$", "caughtErrors": "none" }] */

var websocket;
var hasRequiredWebsocket;

function requireWebsocket () {
	if (hasRequiredWebsocket) return websocket;
	hasRequiredWebsocket = 1;

	const EventEmitter = require$$0$4;
	const https = require$$1$2;
	const http = require$$2$1;
	const net = require$$3$1;
	const tls = require$$4$1;
	const { randomBytes, createHash } = require$$1$1;
	const { Duplex, Readable } = require$$0$3;
	const { URL } = require$$7$1;

	const PerMessageDeflate = requirePermessageDeflate();
	const Receiver = requireReceiver();
	const Sender = requireSender();
	const { isBlob } = requireValidation$1();

	const {
	  BINARY_TYPES,
	  CLOSE_TIMEOUT,
	  EMPTY_BUFFER,
	  GUID,
	  kForOnEventAttribute,
	  kListener,
	  kStatusCode,
	  kWebSocket,
	  NOOP
	} = requireConstants();
	const {
	  EventTarget: { addEventListener, removeEventListener }
	} = requireEventTarget();
	const { format, parse } = requireExtension();
	const { toBuffer } = requireBufferUtil();

	const kAborted = Symbol('kAborted');
	const protocolVersions = [8, 13];
	const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
	const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

	/**
	 * Class representing a WebSocket.
	 *
	 * @extends EventEmitter
	 */
	class WebSocket extends EventEmitter {
	  /**
	   * Create a new `WebSocket`.
	   *
	   * @param {(String|URL)} address The URL to which to connect
	   * @param {(String|String[])} [protocols] The subprotocols
	   * @param {Object} [options] Connection options
	   */
	  constructor(address, protocols, options) {
	    super();

	    this._binaryType = BINARY_TYPES[0];
	    this._closeCode = 1006;
	    this._closeFrameReceived = false;
	    this._closeFrameSent = false;
	    this._closeMessage = EMPTY_BUFFER;
	    this._closeTimer = null;
	    this._errorEmitted = false;
	    this._extensions = {};
	    this._paused = false;
	    this._protocol = '';
	    this._readyState = WebSocket.CONNECTING;
	    this._receiver = null;
	    this._sender = null;
	    this._socket = null;

	    if (address !== null) {
	      this._bufferedAmount = 0;
	      this._isServer = false;
	      this._redirects = 0;

	      if (protocols === undefined) {
	        protocols = [];
	      } else if (!Array.isArray(protocols)) {
	        if (typeof protocols === 'object' && protocols !== null) {
	          options = protocols;
	          protocols = [];
	        } else {
	          protocols = [protocols];
	        }
	      }

	      initAsClient(this, address, protocols, options);
	    } else {
	      this._autoPong = options.autoPong;
	      this._closeTimeout = options.closeTimeout;
	      this._isServer = true;
	    }
	  }

	  /**
	   * For historical reasons, the custom "nodebuffer" type is used by the default
	   * instead of "blob".
	   *
	   * @type {String}
	   */
	  get binaryType() {
	    return this._binaryType;
	  }

	  set binaryType(type) {
	    if (!BINARY_TYPES.includes(type)) return;

	    this._binaryType = type;

	    //
	    // Allow to change `binaryType` on the fly.
	    //
	    if (this._receiver) this._receiver._binaryType = type;
	  }

	  /**
	   * @type {Number}
	   */
	  get bufferedAmount() {
	    if (!this._socket) return this._bufferedAmount;

	    return this._socket._writableState.length + this._sender._bufferedBytes;
	  }

	  /**
	   * @type {String}
	   */
	  get extensions() {
	    return Object.keys(this._extensions).join();
	  }

	  /**
	   * @type {Boolean}
	   */
	  get isPaused() {
	    return this._paused;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onclose() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onerror() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onopen() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onmessage() {
	    return null;
	  }

	  /**
	   * @type {String}
	   */
	  get protocol() {
	    return this._protocol;
	  }

	  /**
	   * @type {Number}
	   */
	  get readyState() {
	    return this._readyState;
	  }

	  /**
	   * @type {String}
	   */
	  get url() {
	    return this._url;
	  }

	  /**
	   * Set up the socket and the internal resources.
	   *
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Object} options Options object
	   * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Number} [options.maxPayload=0] The maximum allowed message size
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   * @private
	   */
	  setSocket(socket, head, options) {
	    const receiver = new Receiver({
	      allowSynchronousEvents: options.allowSynchronousEvents,
	      binaryType: this.binaryType,
	      extensions: this._extensions,
	      isServer: this._isServer,
	      maxPayload: options.maxPayload,
	      skipUTF8Validation: options.skipUTF8Validation
	    });

	    const sender = new Sender(socket, this._extensions, options.generateMask);

	    this._receiver = receiver;
	    this._sender = sender;
	    this._socket = socket;

	    receiver[kWebSocket] = this;
	    sender[kWebSocket] = this;
	    socket[kWebSocket] = this;

	    receiver.on('conclude', receiverOnConclude);
	    receiver.on('drain', receiverOnDrain);
	    receiver.on('error', receiverOnError);
	    receiver.on('message', receiverOnMessage);
	    receiver.on('ping', receiverOnPing);
	    receiver.on('pong', receiverOnPong);

	    sender.onerror = senderOnError;

	    //
	    // These methods may not be available if `socket` is just a `Duplex`.
	    //
	    if (socket.setTimeout) socket.setTimeout(0);
	    if (socket.setNoDelay) socket.setNoDelay();

	    if (head.length > 0) socket.unshift(head);

	    socket.on('close', socketOnClose);
	    socket.on('data', socketOnData);
	    socket.on('end', socketOnEnd);
	    socket.on('error', socketOnError);

	    this._readyState = WebSocket.OPEN;
	    this.emit('open');
	  }

	  /**
	   * Emit the `'close'` event.
	   *
	   * @private
	   */
	  emitClose() {
	    if (!this._socket) {
	      this._readyState = WebSocket.CLOSED;
	      this.emit('close', this._closeCode, this._closeMessage);
	      return;
	    }

	    if (this._extensions[PerMessageDeflate.extensionName]) {
	      this._extensions[PerMessageDeflate.extensionName].cleanup();
	    }

	    this._receiver.removeAllListeners();
	    this._readyState = WebSocket.CLOSED;
	    this.emit('close', this._closeCode, this._closeMessage);
	  }

	  /**
	   * Start a closing handshake.
	   *
	   *          +----------+   +-----------+   +----------+
	   *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
	   *    |     +----------+   +-----------+   +----------+     |
	   *          +----------+   +-----------+         |
	   * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
	   *          +----------+   +-----------+   |
	   *    |           |                        |   +---+        |
	   *                +------------------------+-->|fin| - - - -
	   *    |         +---+                      |   +---+
	   *     - - - - -|fin|<---------------------+
	   *              +---+
	   *
	   * @param {Number} [code] Status code explaining why the connection is closing
	   * @param {(String|Buffer)} [data] The reason why the connection is
	   *     closing
	   * @public
	   */
	  close(code, data) {
	    if (this.readyState === WebSocket.CLOSED) return;
	    if (this.readyState === WebSocket.CONNECTING) {
	      const msg = 'WebSocket was closed before the connection was established';
	      abortHandshake(this, this._req, msg);
	      return;
	    }

	    if (this.readyState === WebSocket.CLOSING) {
	      if (
	        this._closeFrameSent &&
	        (this._closeFrameReceived || this._receiver._writableState.errorEmitted)
	      ) {
	        this._socket.end();
	      }

	      return;
	    }

	    this._readyState = WebSocket.CLOSING;
	    this._sender.close(code, data, !this._isServer, (err) => {
	      //
	      // This error is handled by the `'error'` listener on the socket. We only
	      // want to know if the close frame has been sent here.
	      //
	      if (err) return;

	      this._closeFrameSent = true;

	      if (
	        this._closeFrameReceived ||
	        this._receiver._writableState.errorEmitted
	      ) {
	        this._socket.end();
	      }
	    });

	    setCloseTimer(this);
	  }

	  /**
	   * Pause the socket.
	   *
	   * @public
	   */
	  pause() {
	    if (
	      this.readyState === WebSocket.CONNECTING ||
	      this.readyState === WebSocket.CLOSED
	    ) {
	      return;
	    }

	    this._paused = true;
	    this._socket.pause();
	  }

	  /**
	   * Send a ping.
	   *
	   * @param {*} [data] The data to send
	   * @param {Boolean} [mask] Indicates whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when the ping is sent
	   * @public
	   */
	  ping(data, mask, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof data === 'function') {
	      cb = data;
	      data = mask = undefined;
	    } else if (typeof mask === 'function') {
	      cb = mask;
	      mask = undefined;
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    if (mask === undefined) mask = !this._isServer;
	    this._sender.ping(data || EMPTY_BUFFER, mask, cb);
	  }

	  /**
	   * Send a pong.
	   *
	   * @param {*} [data] The data to send
	   * @param {Boolean} [mask] Indicates whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when the pong is sent
	   * @public
	   */
	  pong(data, mask, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof data === 'function') {
	      cb = data;
	      data = mask = undefined;
	    } else if (typeof mask === 'function') {
	      cb = mask;
	      mask = undefined;
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    if (mask === undefined) mask = !this._isServer;
	    this._sender.pong(data || EMPTY_BUFFER, mask, cb);
	  }

	  /**
	   * Resume the socket.
	   *
	   * @public
	   */
	  resume() {
	    if (
	      this.readyState === WebSocket.CONNECTING ||
	      this.readyState === WebSocket.CLOSED
	    ) {
	      return;
	    }

	    this._paused = false;
	    if (!this._receiver._writableState.needDrain) this._socket.resume();
	  }

	  /**
	   * Send a data message.
	   *
	   * @param {*} data The message to send
	   * @param {Object} [options] Options object
	   * @param {Boolean} [options.binary] Specifies whether `data` is binary or
	   *     text
	   * @param {Boolean} [options.compress] Specifies whether or not to compress
	   *     `data`
	   * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
	   *     last one
	   * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when data is written out
	   * @public
	   */
	  send(data, options, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof options === 'function') {
	      cb = options;
	      options = {};
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    const opts = {
	      binary: typeof data !== 'string',
	      mask: !this._isServer,
	      compress: true,
	      fin: true,
	      ...options
	    };

	    if (!this._extensions[PerMessageDeflate.extensionName]) {
	      opts.compress = false;
	    }

	    this._sender.send(data || EMPTY_BUFFER, opts, cb);
	  }

	  /**
	   * Forcibly close the connection.
	   *
	   * @public
	   */
	  terminate() {
	    if (this.readyState === WebSocket.CLOSED) return;
	    if (this.readyState === WebSocket.CONNECTING) {
	      const msg = 'WebSocket was closed before the connection was established';
	      abortHandshake(this, this._req, msg);
	      return;
	    }

	    if (this._socket) {
	      this._readyState = WebSocket.CLOSING;
	      this._socket.destroy();
	    }
	  }
	}

	/**
	 * @constant {Number} CONNECTING
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CONNECTING', {
	  enumerable: true,
	  value: readyStates.indexOf('CONNECTING')
	});

	/**
	 * @constant {Number} CONNECTING
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CONNECTING', {
	  enumerable: true,
	  value: readyStates.indexOf('CONNECTING')
	});

	/**
	 * @constant {Number} OPEN
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'OPEN', {
	  enumerable: true,
	  value: readyStates.indexOf('OPEN')
	});

	/**
	 * @constant {Number} OPEN
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'OPEN', {
	  enumerable: true,
	  value: readyStates.indexOf('OPEN')
	});

	/**
	 * @constant {Number} CLOSING
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CLOSING', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSING')
	});

	/**
	 * @constant {Number} CLOSING
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CLOSING', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSING')
	});

	/**
	 * @constant {Number} CLOSED
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CLOSED', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSED')
	});

	/**
	 * @constant {Number} CLOSED
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CLOSED', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSED')
	});

	[
	  'binaryType',
	  'bufferedAmount',
	  'extensions',
	  'isPaused',
	  'protocol',
	  'readyState',
	  'url'
	].forEach((property) => {
	  Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
	});

	//
	// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
	// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
	//
	['open', 'error', 'close', 'message'].forEach((method) => {
	  Object.defineProperty(WebSocket.prototype, `on${method}`, {
	    enumerable: true,
	    get() {
	      for (const listener of this.listeners(method)) {
	        if (listener[kForOnEventAttribute]) return listener[kListener];
	      }

	      return null;
	    },
	    set(handler) {
	      for (const listener of this.listeners(method)) {
	        if (listener[kForOnEventAttribute]) {
	          this.removeListener(method, listener);
	          break;
	        }
	      }

	      if (typeof handler !== 'function') return;

	      this.addEventListener(method, handler, {
	        [kForOnEventAttribute]: true
	      });
	    }
	  });
	});

	WebSocket.prototype.addEventListener = addEventListener;
	WebSocket.prototype.removeEventListener = removeEventListener;

	websocket = WebSocket;

	/**
	 * Initialize a WebSocket client.
	 *
	 * @param {WebSocket} websocket The client to initialize
	 * @param {(String|URL)} address The URL to which to connect
	 * @param {Array} protocols The subprotocols
	 * @param {Object} [options] Connection options
	 * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether any
	 *     of the `'message'`, `'ping'`, and `'pong'` events can be emitted multiple
	 *     times in the same tick
	 * @param {Boolean} [options.autoPong=true] Specifies whether or not to
	 *     automatically send a pong in response to a ping
	 * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to wait
	 *     for the closing handshake to finish after `websocket.close()` is called
	 * @param {Function} [options.finishRequest] A function which can be used to
	 *     customize the headers of each http request before it is sent
	 * @param {Boolean} [options.followRedirects=false] Whether or not to follow
	 *     redirects
	 * @param {Function} [options.generateMask] The function used to generate the
	 *     masking key
	 * @param {Number} [options.handshakeTimeout] Timeout in milliseconds for the
	 *     handshake request
	 * @param {Number} [options.maxPayload=104857600] The maximum allowed message
	 *     size
	 * @param {Number} [options.maxRedirects=10] The maximum number of redirects
	 *     allowed
	 * @param {String} [options.origin] Value of the `Origin` or
	 *     `Sec-WebSocket-Origin` header
	 * @param {(Boolean|Object)} [options.perMessageDeflate=true] Enable/disable
	 *     permessage-deflate
	 * @param {Number} [options.protocolVersion=13] Value of the
	 *     `Sec-WebSocket-Version` header
	 * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	 *     not to skip UTF-8 validation for text and close messages
	 * @private
	 */
	function initAsClient(websocket, address, protocols, options) {
	  const opts = {
	    allowSynchronousEvents: true,
	    autoPong: true,
	    closeTimeout: CLOSE_TIMEOUT,
	    protocolVersion: protocolVersions[1],
	    maxPayload: 100 * 1024 * 1024,
	    skipUTF8Validation: false,
	    perMessageDeflate: true,
	    followRedirects: false,
	    maxRedirects: 10,
	    ...options,
	    socketPath: undefined,
	    hostname: undefined,
	    protocol: undefined,
	    timeout: undefined,
	    method: 'GET',
	    host: undefined,
	    path: undefined,
	    port: undefined
	  };

	  websocket._autoPong = opts.autoPong;
	  websocket._closeTimeout = opts.closeTimeout;

	  if (!protocolVersions.includes(opts.protocolVersion)) {
	    throw new RangeError(
	      `Unsupported protocol version: ${opts.protocolVersion} ` +
	        `(supported versions: ${protocolVersions.join(', ')})`
	    );
	  }

	  let parsedUrl;

	  if (address instanceof URL) {
	    parsedUrl = address;
	  } else {
	    try {
	      parsedUrl = new URL(address);
	    } catch (e) {
	      throw new SyntaxError(`Invalid URL: ${address}`);
	    }
	  }

	  if (parsedUrl.protocol === 'http:') {
	    parsedUrl.protocol = 'ws:';
	  } else if (parsedUrl.protocol === 'https:') {
	    parsedUrl.protocol = 'wss:';
	  }

	  websocket._url = parsedUrl.href;

	  const isSecure = parsedUrl.protocol === 'wss:';
	  const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
	  let invalidUrlMessage;

	  if (parsedUrl.protocol !== 'ws:' && !isSecure && !isIpcUrl) {
	    invalidUrlMessage =
	      'The URL\'s protocol must be one of "ws:", "wss:", ' +
	      '"http:", "https:", or "ws+unix:"';
	  } else if (isIpcUrl && !parsedUrl.pathname) {
	    invalidUrlMessage = "The URL's pathname is empty";
	  } else if (parsedUrl.hash) {
	    invalidUrlMessage = 'The URL contains a fragment identifier';
	  }

	  if (invalidUrlMessage) {
	    const err = new SyntaxError(invalidUrlMessage);

	    if (websocket._redirects === 0) {
	      throw err;
	    } else {
	      emitErrorAndClose(websocket, err);
	      return;
	    }
	  }

	  const defaultPort = isSecure ? 443 : 80;
	  const key = randomBytes(16).toString('base64');
	  const request = isSecure ? https.request : http.request;
	  const protocolSet = new Set();
	  let perMessageDeflate;

	  opts.createConnection =
	    opts.createConnection || (isSecure ? tlsConnect : netConnect);
	  opts.defaultPort = opts.defaultPort || defaultPort;
	  opts.port = parsedUrl.port || defaultPort;
	  opts.host = parsedUrl.hostname.startsWith('[')
	    ? parsedUrl.hostname.slice(1, -1)
	    : parsedUrl.hostname;
	  opts.headers = {
	    ...opts.headers,
	    'Sec-WebSocket-Version': opts.protocolVersion,
	    'Sec-WebSocket-Key': key,
	    Connection: 'Upgrade',
	    Upgrade: 'websocket'
	  };
	  opts.path = parsedUrl.pathname + parsedUrl.search;
	  opts.timeout = opts.handshakeTimeout;

	  if (opts.perMessageDeflate) {
	    perMessageDeflate = new PerMessageDeflate(
	      opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
	      false,
	      opts.maxPayload
	    );
	    opts.headers['Sec-WebSocket-Extensions'] = format({
	      [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
	    });
	  }
	  if (protocols.length) {
	    for (const protocol of protocols) {
	      if (
	        typeof protocol !== 'string' ||
	        !subprotocolRegex.test(protocol) ||
	        protocolSet.has(protocol)
	      ) {
	        throw new SyntaxError(
	          'An invalid or duplicated subprotocol was specified'
	        );
	      }

	      protocolSet.add(protocol);
	    }

	    opts.headers['Sec-WebSocket-Protocol'] = protocols.join(',');
	  }
	  if (opts.origin) {
	    if (opts.protocolVersion < 13) {
	      opts.headers['Sec-WebSocket-Origin'] = opts.origin;
	    } else {
	      opts.headers.Origin = opts.origin;
	    }
	  }
	  if (parsedUrl.username || parsedUrl.password) {
	    opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
	  }

	  if (isIpcUrl) {
	    const parts = opts.path.split(':');

	    opts.socketPath = parts[0];
	    opts.path = parts[1];
	  }

	  let req;

	  if (opts.followRedirects) {
	    if (websocket._redirects === 0) {
	      websocket._originalIpc = isIpcUrl;
	      websocket._originalSecure = isSecure;
	      websocket._originalHostOrSocketPath = isIpcUrl
	        ? opts.socketPath
	        : parsedUrl.host;

	      const headers = options && options.headers;

	      //
	      // Shallow copy the user provided options so that headers can be changed
	      // without mutating the original object.
	      //
	      options = { ...options, headers: {} };

	      if (headers) {
	        for (const [key, value] of Object.entries(headers)) {
	          options.headers[key.toLowerCase()] = value;
	        }
	      }
	    } else if (websocket.listenerCount('redirect') === 0) {
	      const isSameHost = isIpcUrl
	        ? websocket._originalIpc
	          ? opts.socketPath === websocket._originalHostOrSocketPath
	          : false
	        : websocket._originalIpc
	          ? false
	          : parsedUrl.host === websocket._originalHostOrSocketPath;

	      if (!isSameHost || (websocket._originalSecure && !isSecure)) {
	        //
	        // Match curl 7.77.0 behavior and drop the following headers. These
	        // headers are also dropped when following a redirect to a subdomain.
	        //
	        delete opts.headers.authorization;
	        delete opts.headers.cookie;

	        if (!isSameHost) delete opts.headers.host;

	        opts.auth = undefined;
	      }
	    }

	    //
	    // Match curl 7.77.0 behavior and make the first `Authorization` header win.
	    // If the `Authorization` header is set, then there is nothing to do as it
	    // will take precedence.
	    //
	    if (opts.auth && !options.headers.authorization) {
	      options.headers.authorization =
	        'Basic ' + Buffer.from(opts.auth).toString('base64');
	    }

	    req = websocket._req = request(opts);

	    if (websocket._redirects) {
	      //
	      // Unlike what is done for the `'upgrade'` event, no early exit is
	      // triggered here if the user calls `websocket.close()` or
	      // `websocket.terminate()` from a listener of the `'redirect'` event. This
	      // is because the user can also call `request.destroy()` with an error
	      // before calling `websocket.close()` or `websocket.terminate()` and this
	      // would result in an error being emitted on the `request` object with no
	      // `'error'` event listeners attached.
	      //
	      websocket.emit('redirect', websocket.url, req);
	    }
	  } else {
	    req = websocket._req = request(opts);
	  }

	  if (opts.timeout) {
	    req.on('timeout', () => {
	      abortHandshake(websocket, req, 'Opening handshake has timed out');
	    });
	  }

	  req.on('error', (err) => {
	    if (req === null || req[kAborted]) return;

	    req = websocket._req = null;
	    emitErrorAndClose(websocket, err);
	  });

	  req.on('response', (res) => {
	    const location = res.headers.location;
	    const statusCode = res.statusCode;

	    if (
	      location &&
	      opts.followRedirects &&
	      statusCode >= 300 &&
	      statusCode < 400
	    ) {
	      if (++websocket._redirects > opts.maxRedirects) {
	        abortHandshake(websocket, req, 'Maximum redirects exceeded');
	        return;
	      }

	      req.abort();

	      let addr;

	      try {
	        addr = new URL(location, address);
	      } catch (e) {
	        const err = new SyntaxError(`Invalid URL: ${location}`);
	        emitErrorAndClose(websocket, err);
	        return;
	      }

	      initAsClient(websocket, addr, protocols, options);
	    } else if (!websocket.emit('unexpected-response', req, res)) {
	      abortHandshake(
	        websocket,
	        req,
	        `Unexpected server response: ${res.statusCode}`
	      );
	    }
	  });

	  req.on('upgrade', (res, socket, head) => {
	    websocket.emit('upgrade', res);

	    //
	    // The user may have closed the connection from a listener of the
	    // `'upgrade'` event.
	    //
	    if (websocket.readyState !== WebSocket.CONNECTING) return;

	    req = websocket._req = null;

	    const upgrade = res.headers.upgrade;

	    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
	      abortHandshake(websocket, socket, 'Invalid Upgrade header');
	      return;
	    }

	    const digest = createHash('sha1')
	      .update(key + GUID)
	      .digest('base64');

	    if (res.headers['sec-websocket-accept'] !== digest) {
	      abortHandshake(websocket, socket, 'Invalid Sec-WebSocket-Accept header');
	      return;
	    }

	    const serverProt = res.headers['sec-websocket-protocol'];
	    let protError;

	    if (serverProt !== undefined) {
	      if (!protocolSet.size) {
	        protError = 'Server sent a subprotocol but none was requested';
	      } else if (!protocolSet.has(serverProt)) {
	        protError = 'Server sent an invalid subprotocol';
	      }
	    } else if (protocolSet.size) {
	      protError = 'Server sent no subprotocol';
	    }

	    if (protError) {
	      abortHandshake(websocket, socket, protError);
	      return;
	    }

	    if (serverProt) websocket._protocol = serverProt;

	    const secWebSocketExtensions = res.headers['sec-websocket-extensions'];

	    if (secWebSocketExtensions !== undefined) {
	      if (!perMessageDeflate) {
	        const message =
	          'Server sent a Sec-WebSocket-Extensions header but no extension ' +
	          'was requested';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      let extensions;

	      try {
	        extensions = parse(secWebSocketExtensions);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Extensions header';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      const extensionNames = Object.keys(extensions);

	      if (
	        extensionNames.length !== 1 ||
	        extensionNames[0] !== PerMessageDeflate.extensionName
	      ) {
	        const message = 'Server indicated an extension that was not requested';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      try {
	        perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Extensions header';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      websocket._extensions[PerMessageDeflate.extensionName] =
	        perMessageDeflate;
	    }

	    websocket.setSocket(socket, head, {
	      allowSynchronousEvents: opts.allowSynchronousEvents,
	      generateMask: opts.generateMask,
	      maxPayload: opts.maxPayload,
	      skipUTF8Validation: opts.skipUTF8Validation
	    });
	  });

	  if (opts.finishRequest) {
	    opts.finishRequest(req, websocket);
	  } else {
	    req.end();
	  }
	}

	/**
	 * Emit the `'error'` and `'close'` events.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {Error} The error to emit
	 * @private
	 */
	function emitErrorAndClose(websocket, err) {
	  websocket._readyState = WebSocket.CLOSING;
	  //
	  // The following assignment is practically useless and is done only for
	  // consistency.
	  //
	  websocket._errorEmitted = true;
	  websocket.emit('error', err);
	  websocket.emitClose();
	}

	/**
	 * Create a `net.Socket` and initiate a connection.
	 *
	 * @param {Object} options Connection options
	 * @return {net.Socket} The newly created socket used to start the connection
	 * @private
	 */
	function netConnect(options) {
	  options.path = options.socketPath;
	  return net.connect(options);
	}

	/**
	 * Create a `tls.TLSSocket` and initiate a connection.
	 *
	 * @param {Object} options Connection options
	 * @return {tls.TLSSocket} The newly created socket used to start the connection
	 * @private
	 */
	function tlsConnect(options) {
	  options.path = undefined;

	  if (!options.servername && options.servername !== '') {
	    options.servername = net.isIP(options.host) ? '' : options.host;
	  }

	  return tls.connect(options);
	}

	/**
	 * Abort the handshake and emit an error.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {(http.ClientRequest|net.Socket|tls.Socket)} stream The request to
	 *     abort or the socket to destroy
	 * @param {String} message The error message
	 * @private
	 */
	function abortHandshake(websocket, stream, message) {
	  websocket._readyState = WebSocket.CLOSING;

	  const err = new Error(message);
	  Error.captureStackTrace(err, abortHandshake);

	  if (stream.setHeader) {
	    stream[kAborted] = true;
	    stream.abort();

	    if (stream.socket && !stream.socket.destroyed) {
	      //
	      // On Node.js >= 14.3.0 `request.abort()` does not destroy the socket if
	      // called after the request completed. See
	      // https://github.com/websockets/ws/issues/1869.
	      //
	      stream.socket.destroy();
	    }

	    process.nextTick(emitErrorAndClose, websocket, err);
	  } else {
	    stream.destroy(err);
	    stream.once('error', websocket.emit.bind(websocket, 'error'));
	    stream.once('close', websocket.emitClose.bind(websocket));
	  }
	}

	/**
	 * Handle cases where the `ping()`, `pong()`, or `send()` methods are called
	 * when the `readyState` attribute is `CLOSING` or `CLOSED`.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {*} [data] The data to send
	 * @param {Function} [cb] Callback
	 * @private
	 */
	function sendAfterClose(websocket, data, cb) {
	  if (data) {
	    const length = isBlob(data) ? data.size : toBuffer(data).length;

	    //
	    // The `_bufferedAmount` property is used only when the peer is a client and
	    // the opening handshake fails. Under these circumstances, in fact, the
	    // `setSocket()` method is not called, so the `_socket` and `_sender`
	    // properties are set to `null`.
	    //
	    if (websocket._socket) websocket._sender._bufferedBytes += length;
	    else websocket._bufferedAmount += length;
	  }

	  if (cb) {
	    const err = new Error(
	      `WebSocket is not open: readyState ${websocket.readyState} ` +
	        `(${readyStates[websocket.readyState]})`
	    );
	    process.nextTick(cb, err);
	  }
	}

	/**
	 * The listener of the `Receiver` `'conclude'` event.
	 *
	 * @param {Number} code The status code
	 * @param {Buffer} reason The reason for closing
	 * @private
	 */
	function receiverOnConclude(code, reason) {
	  const websocket = this[kWebSocket];

	  websocket._closeFrameReceived = true;
	  websocket._closeMessage = reason;
	  websocket._closeCode = code;

	  if (websocket._socket[kWebSocket] === undefined) return;

	  websocket._socket.removeListener('data', socketOnData);
	  process.nextTick(resume, websocket._socket);

	  if (code === 1005) websocket.close();
	  else websocket.close(code, reason);
	}

	/**
	 * The listener of the `Receiver` `'drain'` event.
	 *
	 * @private
	 */
	function receiverOnDrain() {
	  const websocket = this[kWebSocket];

	  if (!websocket.isPaused) websocket._socket.resume();
	}

	/**
	 * The listener of the `Receiver` `'error'` event.
	 *
	 * @param {(RangeError|Error)} err The emitted error
	 * @private
	 */
	function receiverOnError(err) {
	  const websocket = this[kWebSocket];

	  if (websocket._socket[kWebSocket] !== undefined) {
	    websocket._socket.removeListener('data', socketOnData);

	    //
	    // On Node.js < 14.0.0 the `'error'` event is emitted synchronously. See
	    // https://github.com/websockets/ws/issues/1940.
	    //
	    process.nextTick(resume, websocket._socket);

	    websocket.close(err[kStatusCode]);
	  }

	  if (!websocket._errorEmitted) {
	    websocket._errorEmitted = true;
	    websocket.emit('error', err);
	  }
	}

	/**
	 * The listener of the `Receiver` `'finish'` event.
	 *
	 * @private
	 */
	function receiverOnFinish() {
	  this[kWebSocket].emitClose();
	}

	/**
	 * The listener of the `Receiver` `'message'` event.
	 *
	 * @param {Buffer|ArrayBuffer|Buffer[])} data The message
	 * @param {Boolean} isBinary Specifies whether the message is binary or not
	 * @private
	 */
	function receiverOnMessage(data, isBinary) {
	  this[kWebSocket].emit('message', data, isBinary);
	}

	/**
	 * The listener of the `Receiver` `'ping'` event.
	 *
	 * @param {Buffer} data The data included in the ping frame
	 * @private
	 */
	function receiverOnPing(data) {
	  const websocket = this[kWebSocket];

	  if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
	  websocket.emit('ping', data);
	}

	/**
	 * The listener of the `Receiver` `'pong'` event.
	 *
	 * @param {Buffer} data The data included in the pong frame
	 * @private
	 */
	function receiverOnPong(data) {
	  this[kWebSocket].emit('pong', data);
	}

	/**
	 * Resume a readable stream
	 *
	 * @param {Readable} stream The readable stream
	 * @private
	 */
	function resume(stream) {
	  stream.resume();
	}

	/**
	 * The `Sender` error event handler.
	 *
	 * @param {Error} The error
	 * @private
	 */
	function senderOnError(err) {
	  const websocket = this[kWebSocket];

	  if (websocket.readyState === WebSocket.CLOSED) return;
	  if (websocket.readyState === WebSocket.OPEN) {
	    websocket._readyState = WebSocket.CLOSING;
	    setCloseTimer(websocket);
	  }

	  //
	  // `socket.end()` is used instead of `socket.destroy()` to allow the other
	  // peer to finish sending queued data. There is no need to set a timer here
	  // because `CLOSING` means that it is already set or not needed.
	  //
	  this._socket.end();

	  if (!websocket._errorEmitted) {
	    websocket._errorEmitted = true;
	    websocket.emit('error', err);
	  }
	}

	/**
	 * Set a timer to destroy the underlying raw socket of a WebSocket.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @private
	 */
	function setCloseTimer(websocket) {
	  websocket._closeTimer = setTimeout(
	    websocket._socket.destroy.bind(websocket._socket),
	    websocket._closeTimeout
	  );
	}

	/**
	 * The listener of the socket `'close'` event.
	 *
	 * @private
	 */
	function socketOnClose() {
	  const websocket = this[kWebSocket];

	  this.removeListener('close', socketOnClose);
	  this.removeListener('data', socketOnData);
	  this.removeListener('end', socketOnEnd);

	  websocket._readyState = WebSocket.CLOSING;

	  //
	  // The close frame might not have been received or the `'end'` event emitted,
	  // for example, if the socket was destroyed due to an error. Ensure that the
	  // `receiver` stream is closed after writing any remaining buffered data to
	  // it. If the readable side of the socket is in flowing mode then there is no
	  // buffered data as everything has been already written. If instead, the
	  // socket is paused, any possible buffered data will be read as a single
	  // chunk.
	  //
	  if (
	    !this._readableState.endEmitted &&
	    !websocket._closeFrameReceived &&
	    !websocket._receiver._writableState.errorEmitted &&
	    this._readableState.length !== 0
	  ) {
	    const chunk = this.read(this._readableState.length);

	    websocket._receiver.write(chunk);
	  }

	  websocket._receiver.end();

	  this[kWebSocket] = undefined;

	  clearTimeout(websocket._closeTimer);

	  if (
	    websocket._receiver._writableState.finished ||
	    websocket._receiver._writableState.errorEmitted
	  ) {
	    websocket.emitClose();
	  } else {
	    websocket._receiver.on('error', receiverOnFinish);
	    websocket._receiver.on('finish', receiverOnFinish);
	  }
	}

	/**
	 * The listener of the socket `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function socketOnData(chunk) {
	  if (!this[kWebSocket]._receiver.write(chunk)) {
	    this.pause();
	  }
	}

	/**
	 * The listener of the socket `'end'` event.
	 *
	 * @private
	 */
	function socketOnEnd() {
	  const websocket = this[kWebSocket];

	  websocket._readyState = WebSocket.CLOSING;
	  websocket._receiver.end();
	  this.end();
	}

	/**
	 * The listener of the socket `'error'` event.
	 *
	 * @private
	 */
	function socketOnError() {
	  const websocket = this[kWebSocket];

	  this.removeListener('error', socketOnError);
	  this.on('error', NOOP);

	  if (websocket) {
	    websocket._readyState = WebSocket.CLOSING;
	    this.destroy();
	  }
	}
	return websocket;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^WebSocket$" }] */

var stream;
var hasRequiredStream;

function requireStream () {
	if (hasRequiredStream) return stream;
	hasRequiredStream = 1;

	requireWebsocket();
	const { Duplex } = require$$0$3;

	/**
	 * Emits the `'close'` event on a stream.
	 *
	 * @param {Duplex} stream The stream.
	 * @private
	 */
	function emitClose(stream) {
	  stream.emit('close');
	}

	/**
	 * The listener of the `'end'` event.
	 *
	 * @private
	 */
	function duplexOnEnd() {
	  if (!this.destroyed && this._writableState.finished) {
	    this.destroy();
	  }
	}

	/**
	 * The listener of the `'error'` event.
	 *
	 * @param {Error} err The error
	 * @private
	 */
	function duplexOnError(err) {
	  this.removeListener('error', duplexOnError);
	  this.destroy();
	  if (this.listenerCount('error') === 0) {
	    // Do not suppress the throwing behavior.
	    this.emit('error', err);
	  }
	}

	/**
	 * Wraps a `WebSocket` in a duplex stream.
	 *
	 * @param {WebSocket} ws The `WebSocket` to wrap
	 * @param {Object} [options] The options for the `Duplex` constructor
	 * @return {Duplex} The duplex stream
	 * @public
	 */
	function createWebSocketStream(ws, options) {
	  let terminateOnDestroy = true;

	  const duplex = new Duplex({
	    ...options,
	    autoDestroy: false,
	    emitClose: false,
	    objectMode: false,
	    writableObjectMode: false
	  });

	  ws.on('message', function message(msg, isBinary) {
	    const data =
	      !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;

	    if (!duplex.push(data)) ws.pause();
	  });

	  ws.once('error', function error(err) {
	    if (duplex.destroyed) return;

	    // Prevent `ws.terminate()` from being called by `duplex._destroy()`.
	    //
	    // - If the `'error'` event is emitted before the `'open'` event, then
	    //   `ws.terminate()` is a noop as no socket is assigned.
	    // - Otherwise, the error is re-emitted by the listener of the `'error'`
	    //   event of the `Receiver` object. The listener already closes the
	    //   connection by calling `ws.close()`. This allows a close frame to be
	    //   sent to the other peer. If `ws.terminate()` is called right after this,
	    //   then the close frame might not be sent.
	    terminateOnDestroy = false;
	    duplex.destroy(err);
	  });

	  ws.once('close', function close() {
	    if (duplex.destroyed) return;

	    duplex.push(null);
	  });

	  duplex._destroy = function (err, callback) {
	    if (ws.readyState === ws.CLOSED) {
	      callback(err);
	      process.nextTick(emitClose, duplex);
	      return;
	    }

	    let called = false;

	    ws.once('error', function error(err) {
	      called = true;
	      callback(err);
	    });

	    ws.once('close', function close() {
	      if (!called) callback(err);
	      process.nextTick(emitClose, duplex);
	    });

	    if (terminateOnDestroy) ws.terminate();
	  };

	  duplex._final = function (callback) {
	    if (ws.readyState === ws.CONNECTING) {
	      ws.once('open', function open() {
	        duplex._final(callback);
	      });
	      return;
	    }

	    // If the value of the `_socket` property is `null` it means that `ws` is a
	    // client websocket and the handshake failed. In fact, when this happens, a
	    // socket is never assigned to the websocket. Wait for the `'error'` event
	    // that will be emitted by the websocket.
	    if (ws._socket === null) return;

	    if (ws._socket._writableState.finished) {
	      callback();
	      if (duplex._readableState.endEmitted) duplex.destroy();
	    } else {
	      ws._socket.once('finish', function finish() {
	        // `duplex` is not destroyed here because the `'end'` event will be
	        // emitted on `duplex` after this `'finish'` event. The EOF signaling
	        // `null` chunk is, in fact, pushed when the websocket emits `'close'`.
	        callback();
	      });
	      ws.close();
	    }
	  };

	  duplex._read = function () {
	    if (ws.isPaused) ws.resume();
	  };

	  duplex._write = function (chunk, encoding, callback) {
	    if (ws.readyState === ws.CONNECTING) {
	      ws.once('open', function open() {
	        duplex._write(chunk, encoding, callback);
	      });
	      return;
	    }

	    ws.send(chunk, callback);
	  };

	  duplex.on('end', duplexOnEnd);
	  duplex.on('error', duplexOnError);
	  return duplex;
	}

	stream = createWebSocketStream;
	return stream;
}

requireStream();

requireReceiver();

requireSender();

var websocketExports = requireWebsocket();
var WebSocket = /*@__PURE__*/getDefaultExportFromCjs(websocketExports);

var subprotocol;
var hasRequiredSubprotocol;

function requireSubprotocol () {
	if (hasRequiredSubprotocol) return subprotocol;
	hasRequiredSubprotocol = 1;

	const { tokenChars } = requireValidation$1();

	/**
	 * Parses the `Sec-WebSocket-Protocol` header into a set of subprotocol names.
	 *
	 * @param {String} header The field value of the header
	 * @return {Set} The subprotocol names
	 * @public
	 */
	function parse(header) {
	  const protocols = new Set();
	  let start = -1;
	  let end = -1;
	  let i = 0;

	  for (i; i < header.length; i++) {
	    const code = header.charCodeAt(i);

	    if (end === -1 && tokenChars[code] === 1) {
	      if (start === -1) start = i;
	    } else if (
	      i !== 0 &&
	      (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */
	    ) {
	      if (end === -1 && start !== -1) end = i;
	    } else if (code === 0x2c /* ',' */) {
	      if (start === -1) {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }

	      if (end === -1) end = i;

	      const protocol = header.slice(start, end);

	      if (protocols.has(protocol)) {
	        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
	      }

	      protocols.add(protocol);
	      start = end = -1;
	    } else {
	      throw new SyntaxError(`Unexpected character at index ${i}`);
	    }
	  }

	  if (start === -1 || end !== -1) {
	    throw new SyntaxError('Unexpected end of input');
	  }

	  const protocol = header.slice(start, i);

	  if (protocols.has(protocol)) {
	    throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
	  }

	  protocols.add(protocol);
	  return protocols;
	}

	subprotocol = { parse };
	return subprotocol;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex$", "caughtErrors": "none" }] */

var websocketServer;
var hasRequiredWebsocketServer;

function requireWebsocketServer () {
	if (hasRequiredWebsocketServer) return websocketServer;
	hasRequiredWebsocketServer = 1;

	const EventEmitter = require$$0$4;
	const http = require$$2$1;
	const { Duplex } = require$$0$3;
	const { createHash } = require$$1$1;

	const extension = requireExtension();
	const PerMessageDeflate = requirePermessageDeflate();
	const subprotocol = requireSubprotocol();
	const WebSocket = requireWebsocket();
	const { CLOSE_TIMEOUT, GUID, kWebSocket } = requireConstants();

	const keyRegex = /^[+/0-9A-Za-z]{22}==$/;

	const RUNNING = 0;
	const CLOSING = 1;
	const CLOSED = 2;

	/**
	 * Class representing a WebSocket server.
	 *
	 * @extends EventEmitter
	 */
	class WebSocketServer extends EventEmitter {
	  /**
	   * Create a `WebSocketServer` instance.
	   *
	   * @param {Object} options Configuration options
	   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {Boolean} [options.autoPong=true] Specifies whether or not to
	   *     automatically send a pong in response to a ping
	   * @param {Number} [options.backlog=511] The maximum length of the queue of
	   *     pending connections
	   * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
	   *     track clients
	   * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
	   *     wait for the closing handshake to finish after `websocket.close()` is
	   *     called
	   * @param {Function} [options.handleProtocols] A hook to handle protocols
	   * @param {String} [options.host] The hostname where to bind the server
	   * @param {Number} [options.maxPayload=104857600] The maximum allowed message
	   *     size
	   * @param {Boolean} [options.noServer=false] Enable no server mode
	   * @param {String} [options.path] Accept only connections matching this path
	   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
	   *     permessage-deflate
	   * @param {Number} [options.port] The port where to bind the server
	   * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
	   *     server to use
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   * @param {Function} [options.verifyClient] A hook to reject connections
	   * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
	   *     class to use. It must be the `WebSocket` class or class that extends it
	   * @param {Function} [callback] A listener for the `listening` event
	   */
	  constructor(options, callback) {
	    super();

	    options = {
	      allowSynchronousEvents: true,
	      autoPong: true,
	      maxPayload: 100 * 1024 * 1024,
	      skipUTF8Validation: false,
	      perMessageDeflate: false,
	      handleProtocols: null,
	      clientTracking: true,
	      closeTimeout: CLOSE_TIMEOUT,
	      verifyClient: null,
	      noServer: false,
	      backlog: null, // use default (511 as implemented in net.js)
	      server: null,
	      host: null,
	      path: null,
	      port: null,
	      WebSocket,
	      ...options
	    };

	    if (
	      (options.port == null && !options.server && !options.noServer) ||
	      (options.port != null && (options.server || options.noServer)) ||
	      (options.server && options.noServer)
	    ) {
	      throw new TypeError(
	        'One and only one of the "port", "server", or "noServer" options ' +
	          'must be specified'
	      );
	    }

	    if (options.port != null) {
	      this._server = http.createServer((req, res) => {
	        const body = http.STATUS_CODES[426];

	        res.writeHead(426, {
	          'Content-Length': body.length,
	          'Content-Type': 'text/plain'
	        });
	        res.end(body);
	      });
	      this._server.listen(
	        options.port,
	        options.host,
	        options.backlog,
	        callback
	      );
	    } else if (options.server) {
	      this._server = options.server;
	    }

	    if (this._server) {
	      const emitConnection = this.emit.bind(this, 'connection');

	      this._removeListeners = addListeners(this._server, {
	        listening: this.emit.bind(this, 'listening'),
	        error: this.emit.bind(this, 'error'),
	        upgrade: (req, socket, head) => {
	          this.handleUpgrade(req, socket, head, emitConnection);
	        }
	      });
	    }

	    if (options.perMessageDeflate === true) options.perMessageDeflate = {};
	    if (options.clientTracking) {
	      this.clients = new Set();
	      this._shouldEmitClose = false;
	    }

	    this.options = options;
	    this._state = RUNNING;
	  }

	  /**
	   * Returns the bound address, the address family name, and port of the server
	   * as reported by the operating system if listening on an IP socket.
	   * If the server is listening on a pipe or UNIX domain socket, the name is
	   * returned as a string.
	   *
	   * @return {(Object|String|null)} The address of the server
	   * @public
	   */
	  address() {
	    if (this.options.noServer) {
	      throw new Error('The server is operating in "noServer" mode');
	    }

	    if (!this._server) return null;
	    return this._server.address();
	  }

	  /**
	   * Stop the server from accepting new connections and emit the `'close'` event
	   * when all existing connections are closed.
	   *
	   * @param {Function} [cb] A one-time listener for the `'close'` event
	   * @public
	   */
	  close(cb) {
	    if (this._state === CLOSED) {
	      if (cb) {
	        this.once('close', () => {
	          cb(new Error('The server is not running'));
	        });
	      }

	      process.nextTick(emitClose, this);
	      return;
	    }

	    if (cb) this.once('close', cb);

	    if (this._state === CLOSING) return;
	    this._state = CLOSING;

	    if (this.options.noServer || this.options.server) {
	      if (this._server) {
	        this._removeListeners();
	        this._removeListeners = this._server = null;
	      }

	      if (this.clients) {
	        if (!this.clients.size) {
	          process.nextTick(emitClose, this);
	        } else {
	          this._shouldEmitClose = true;
	        }
	      } else {
	        process.nextTick(emitClose, this);
	      }
	    } else {
	      const server = this._server;

	      this._removeListeners();
	      this._removeListeners = this._server = null;

	      //
	      // The HTTP/S server was created internally. Close it, and rely on its
	      // `'close'` event.
	      //
	      server.close(() => {
	        emitClose(this);
	      });
	    }
	  }

	  /**
	   * See if a given request should be handled by this server instance.
	   *
	   * @param {http.IncomingMessage} req Request object to inspect
	   * @return {Boolean} `true` if the request is valid, else `false`
	   * @public
	   */
	  shouldHandle(req) {
	    if (this.options.path) {
	      const index = req.url.indexOf('?');
	      const pathname = index !== -1 ? req.url.slice(0, index) : req.url;

	      if (pathname !== this.options.path) return false;
	    }

	    return true;
	  }

	  /**
	   * Handle a HTTP Upgrade request.
	   *
	   * @param {http.IncomingMessage} req The request object
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Function} cb Callback
	   * @public
	   */
	  handleUpgrade(req, socket, head, cb) {
	    socket.on('error', socketOnError);

	    const key = req.headers['sec-websocket-key'];
	    const upgrade = req.headers.upgrade;
	    const version = +req.headers['sec-websocket-version'];

	    if (req.method !== 'GET') {
	      const message = 'Invalid HTTP method';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
	      return;
	    }

	    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
	      const message = 'Invalid Upgrade header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	      return;
	    }

	    if (key === undefined || !keyRegex.test(key)) {
	      const message = 'Missing or invalid Sec-WebSocket-Key header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	      return;
	    }

	    if (version !== 13 && version !== 8) {
	      const message = 'Missing or invalid Sec-WebSocket-Version header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
	        'Sec-WebSocket-Version': '13, 8'
	      });
	      return;
	    }

	    if (!this.shouldHandle(req)) {
	      abortHandshake(socket, 400);
	      return;
	    }

	    const secWebSocketProtocol = req.headers['sec-websocket-protocol'];
	    let protocols = new Set();

	    if (secWebSocketProtocol !== undefined) {
	      try {
	        protocols = subprotocol.parse(secWebSocketProtocol);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Protocol header';
	        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	        return;
	      }
	    }

	    const secWebSocketExtensions = req.headers['sec-websocket-extensions'];
	    const extensions = {};

	    if (
	      this.options.perMessageDeflate &&
	      secWebSocketExtensions !== undefined
	    ) {
	      const perMessageDeflate = new PerMessageDeflate(
	        this.options.perMessageDeflate,
	        true,
	        this.options.maxPayload
	      );

	      try {
	        const offers = extension.parse(secWebSocketExtensions);

	        if (offers[PerMessageDeflate.extensionName]) {
	          perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
	          extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
	        }
	      } catch (err) {
	        const message =
	          'Invalid or unacceptable Sec-WebSocket-Extensions header';
	        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	        return;
	      }
	    }

	    //
	    // Optionally call external client verification handler.
	    //
	    if (this.options.verifyClient) {
	      const info = {
	        origin:
	          req.headers[`${version === 8 ? 'sec-websocket-origin' : 'origin'}`],
	        secure: !!(req.socket.authorized || req.socket.encrypted),
	        req
	      };

	      if (this.options.verifyClient.length === 2) {
	        this.options.verifyClient(info, (verified, code, message, headers) => {
	          if (!verified) {
	            return abortHandshake(socket, code || 401, message, headers);
	          }

	          this.completeUpgrade(
	            extensions,
	            key,
	            protocols,
	            req,
	            socket,
	            head,
	            cb
	          );
	        });
	        return;
	      }

	      if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
	    }

	    this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
	  }

	  /**
	   * Upgrade the connection to WebSocket.
	   *
	   * @param {Object} extensions The accepted extensions
	   * @param {String} key The value of the `Sec-WebSocket-Key` header
	   * @param {Set} protocols The subprotocols
	   * @param {http.IncomingMessage} req The request object
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Function} cb Callback
	   * @throws {Error} If called more than once with the same socket
	   * @private
	   */
	  completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
	    //
	    // Destroy the socket if the client has already sent a FIN packet.
	    //
	    if (!socket.readable || !socket.writable) return socket.destroy();

	    if (socket[kWebSocket]) {
	      throw new Error(
	        'server.handleUpgrade() was called more than once with the same ' +
	          'socket, possibly due to a misconfiguration'
	      );
	    }

	    if (this._state > RUNNING) return abortHandshake(socket, 503);

	    const digest = createHash('sha1')
	      .update(key + GUID)
	      .digest('base64');

	    const headers = [
	      'HTTP/1.1 101 Switching Protocols',
	      'Upgrade: websocket',
	      'Connection: Upgrade',
	      `Sec-WebSocket-Accept: ${digest}`
	    ];

	    const ws = new this.options.WebSocket(null, undefined, this.options);

	    if (protocols.size) {
	      //
	      // Optionally call external protocol selection handler.
	      //
	      const protocol = this.options.handleProtocols
	        ? this.options.handleProtocols(protocols, req)
	        : protocols.values().next().value;

	      if (protocol) {
	        headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
	        ws._protocol = protocol;
	      }
	    }

	    if (extensions[PerMessageDeflate.extensionName]) {
	      const params = extensions[PerMessageDeflate.extensionName].params;
	      const value = extension.format({
	        [PerMessageDeflate.extensionName]: [params]
	      });
	      headers.push(`Sec-WebSocket-Extensions: ${value}`);
	      ws._extensions = extensions;
	    }

	    //
	    // Allow external modification/inspection of handshake headers.
	    //
	    this.emit('headers', headers, req);

	    socket.write(headers.concat('\r\n').join('\r\n'));
	    socket.removeListener('error', socketOnError);

	    ws.setSocket(socket, head, {
	      allowSynchronousEvents: this.options.allowSynchronousEvents,
	      maxPayload: this.options.maxPayload,
	      skipUTF8Validation: this.options.skipUTF8Validation
	    });

	    if (this.clients) {
	      this.clients.add(ws);
	      ws.on('close', () => {
	        this.clients.delete(ws);

	        if (this._shouldEmitClose && !this.clients.size) {
	          process.nextTick(emitClose, this);
	        }
	      });
	    }

	    cb(ws, req);
	  }
	}

	websocketServer = WebSocketServer;

	/**
	 * Add event listeners on an `EventEmitter` using a map of <event, listener>
	 * pairs.
	 *
	 * @param {EventEmitter} server The event emitter
	 * @param {Object.<String, Function>} map The listeners to add
	 * @return {Function} A function that will remove the added listeners when
	 *     called
	 * @private
	 */
	function addListeners(server, map) {
	  for (const event of Object.keys(map)) server.on(event, map[event]);

	  return function removeListeners() {
	    for (const event of Object.keys(map)) {
	      server.removeListener(event, map[event]);
	    }
	  };
	}

	/**
	 * Emit a `'close'` event on an `EventEmitter`.
	 *
	 * @param {EventEmitter} server The event emitter
	 * @private
	 */
	function emitClose(server) {
	  server._state = CLOSED;
	  server.emit('close');
	}

	/**
	 * Handle socket errors.
	 *
	 * @private
	 */
	function socketOnError() {
	  this.destroy();
	}

	/**
	 * Close the connection when preconditions are not fulfilled.
	 *
	 * @param {Duplex} socket The socket of the upgrade request
	 * @param {Number} code The HTTP response status code
	 * @param {String} [message] The HTTP response body
	 * @param {Object} [headers] Additional HTTP response headers
	 * @private
	 */
	function abortHandshake(socket, code, message, headers) {
	  //
	  // The socket is writable unless the user destroyed or ended it before calling
	  // `server.handleUpgrade()` or in the `verifyClient` function, which is a user
	  // error. Handling this does not make much sense as the worst that can happen
	  // is that some of the data written by the user might be discarded due to the
	  // call to `socket.end()` below, which triggers an `'error'` event that in
	  // turn causes the socket to be destroyed.
	  //
	  message = message || http.STATUS_CODES[code];
	  headers = {
	    Connection: 'close',
	    'Content-Type': 'text/html',
	    'Content-Length': Buffer.byteLength(message),
	    ...headers
	  };

	  socket.once('finish', socket.destroy);

	  socket.end(
	    `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` +
	      Object.keys(headers)
	        .map((h) => `${h}: ${headers[h]}`)
	        .join('\r\n') +
	      '\r\n\r\n' +
	      message
	  );
	}

	/**
	 * Emit a `'wsClientError'` event on a `WebSocketServer` if there is at least
	 * one listener for it, otherwise call `abortHandshake()`.
	 *
	 * @param {WebSocketServer} server The WebSocket server
	 * @param {http.IncomingMessage} req The request object
	 * @param {Duplex} socket The socket of the upgrade request
	 * @param {Number} code The HTTP response status code
	 * @param {String} message The HTTP response body
	 * @param {Object} [headers] The HTTP response headers
	 * @private
	 */
	function abortHandshakeOrEmitwsClientError(
	  server,
	  req,
	  socket,
	  code,
	  message,
	  headers
	) {
	  if (server.listenerCount('wsClientError')) {
	    const err = new Error(message);
	    Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);

	    server.emit('wsClientError', err, socket, req);
	  } else {
	    abortHandshake(socket, code, message, headers);
	  }
	}
	return websocketServer;
}

requireWebsocketServer();

/**!
 * @author Elgato
 * @module elgato/streamdeck
 * @license MIT
 * @copyright Copyright (c) Corsair Memory Inc.
 */
/**
 * Stream Deck device types.
 */
var DeviceType;
(function (DeviceType) {
    /**
     * Stream Deck, comprised of 15 customizable LCD keys in a 5 x 3 layout.
     */
    DeviceType[DeviceType["StreamDeck"] = 0] = "StreamDeck";
    /**
     * Stream Deck Mini, comprised of 6 customizable LCD keys in a 3 x 2 layout.
     */
    DeviceType[DeviceType["StreamDeckMini"] = 1] = "StreamDeckMini";
    /**
     * Stream Deck XL, comprised of 32 customizable LCD keys in an 8 x 4 layout.
     */
    DeviceType[DeviceType["StreamDeckXL"] = 2] = "StreamDeckXL";
    /**
     * Stream Deck Mobile, for iOS and Android.
     */
    DeviceType[DeviceType["StreamDeckMobile"] = 3] = "StreamDeckMobile";
    /**
     * Corsair G Keys, available on select Corsair keyboards.
     */
    DeviceType[DeviceType["CorsairGKeys"] = 4] = "CorsairGKeys";
    /**
     * Stream Deck Pedal, comprised of 3 customizable pedals.
     */
    DeviceType[DeviceType["StreamDeckPedal"] = 5] = "StreamDeckPedal";
    /**
     * Corsair Voyager laptop, comprising 10 buttons in a horizontal line above the keyboard.
     */
    DeviceType[DeviceType["CorsairVoyager"] = 6] = "CorsairVoyager";
    /**
     * Stream Deck +, comprised of 8 customizable LCD keys in a 4 x 2 layout, a touch strip, and 4 dials.
     */
    DeviceType[DeviceType["StreamDeckPlus"] = 7] = "StreamDeckPlus";
    /**
     * SCUF controller G keys, available on select SCUF controllers, for example SCUF Envision.
     */
    DeviceType[DeviceType["SCUFController"] = 8] = "SCUFController";
    /**
     * Stream Deck Neo, comprised of 8 customizable LCD keys in a 4 x 2 layout, an info bar, and 2 touch points for page navigation.
     */
    DeviceType[DeviceType["StreamDeckNeo"] = 9] = "StreamDeckNeo";
    /**
     * Stream Deck Studio, comprised of 32 customizable LCD keys in a 16 x 2 layout, and 2 dials (1 on either side).
     */
    DeviceType[DeviceType["StreamDeckStudio"] = 10] = "StreamDeckStudio";
    /**
     * Virtual Stream Deck, comprised of 1 to 64 action (on-screen) on a scalable canvas, with a maximum layout of 8 x 8.
     */
    DeviceType[DeviceType["VirtualStreamDeck"] = 11] = "VirtualStreamDeck";
    /**
     * High-performance gaming keyboard, with a built-in Stream Deck comprised of 12 customizable LCD keys in a 3 x 4 layout, an LCD screen, and 2 dials.
     */
    DeviceType[DeviceType["Galleon100SD"] = 12] = "Galleon100SD";
    /**
     * Stream Deck + XL, comprised of 36 customizable LCD keys in a 9 x 4 layout, a touch strip, and 6 dials.
     */
    DeviceType[DeviceType["StreamDeckPlusXL"] = 13] = "StreamDeckPlusXL";
})(DeviceType || (DeviceType = {}));

/**
 * List of available types that can be applied to {@link Bar} and {@link GBar} to determine their style.
 */
var BarSubType;
(function (BarSubType) {
    /**
     * Rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Rectangle"] = 0] = "Rectangle";
    /**
     * Rectangle bar; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}.
     * @example
     * // Value is 2, range is 1-10.
     * // [  ███     ]
     * @example
     * // Value is 10, range is 1-10.
     * // [     █████]
     */
    BarSubType[BarSubType["DoubleRectangle"] = 1] = "DoubleRectangle";
    /**
     * Trapezoid bar, represented as a right-angle triangle; the bar fills from left to right, determined by the {@link Bar.value}, similar to a volume meter.
     */
    BarSubType[BarSubType["Trapezoid"] = 2] = "Trapezoid";
    /**
     * Trapezoid bar, represented by two right-angle triangles; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}. See {@link BarSubType.DoubleRectangle}.
     */
    BarSubType[BarSubType["DoubleTrapezoid"] = 3] = "DoubleTrapezoid";
    /**
     * Rounded rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Groove"] = 4] = "Groove";
})(BarSubType || (BarSubType = {}));

/**
 * Defines the type of argument supplied by Stream Deck.
 */
var RegistrationParameter;
(function (RegistrationParameter) {
    /**
     * Identifies the argument that specifies the web socket port that Stream Deck is listening on.
     */
    RegistrationParameter["Port"] = "-port";
    /**
     * Identifies the argument that supplies information about the Stream Deck and the plugin.
     */
    RegistrationParameter["Info"] = "-info";
    /**
     * Identifies the argument that specifies the unique identifier that can be used when registering the plugin.
     */
    RegistrationParameter["PluginUUID"] = "-pluginUUID";
    /**
     * Identifies the argument that specifies the event to be sent to Stream Deck as part of the registration procedure.
     */
    RegistrationParameter["RegisterEvent"] = "-registerEvent";
})(RegistrationParameter || (RegistrationParameter = {}));

/**
 * Defines the target of a request, i.e. whether the request should update the Stream Deck hardware, Stream Deck software (application), or both, when calling `setImage` and `setState`.
 */
var Target;
(function (Target) {
    /**
     * Hardware and software should be updated as part of the request.
     */
    Target[Target["HardwareAndSoftware"] = 0] = "HardwareAndSoftware";
    /**
     * Hardware only should be updated as part of the request.
     */
    Target[Target["Hardware"] = 1] = "Hardware";
    /**
     * Software only should be updated as part of the request.
     */
    Target[Target["Software"] = 2] = "Software";
})(Target || (Target = {}));

/**
 * Provides information for a version, as parsed from a string denoted as a collection of numbers separated by a period, for example `1.45.2`, `4.0.2.13098`. Parsing is opinionated
 * and strings should strictly conform to the format `{major}[.{minor}[.{patch}[.{build}]]]`; version numbers that form the version are optional, and when `undefined` will default to
 * 0, for example the `minor`, `patch`, or `build` number may be omitted.
 *
 * NB: This implementation should be considered fit-for-purpose, and should be used sparing.
 */
class Version {
    /**
     * Build version number.
     */
    build;
    /**
     * Major version number.
     */
    major;
    /**
     * Minor version number.
     */
    minor;
    /**
     * Patch version number.
     */
    patch;
    /**
     * Initializes a new instance of the {@link Version} class.
     * @param value Value to parse the version from.
     */
    constructor(value) {
        const result = value.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/);
        if (result === null) {
            throw new Error(`Invalid format; expected "{major}[.{minor}[.{patch}[.{build}]]]" but was "${value}"`);
        }
        [, this.major, this.minor, this.patch, this.build] = [...result.map((value) => parseInt(value) || 0)];
    }
    /**
     * Compares this instance to the {@link other} {@link Version}.
     * @param other The {@link Version} to compare to.
     * @returns `-1` when this instance is less than the {@link other}, `1` when this instance is greater than {@link other}, otherwise `0`.
     */
    compareTo(other) {
        const segments = ({ major, minor, build, patch }) => [major, minor, build, patch];
        const thisSegments = segments(this);
        const otherSegments = segments(other);
        for (let i = 0; i < 4; i++) {
            if (thisSegments[i] < otherSegments[i]) {
                return -1;
            }
            else if (thisSegments[i] > otherSegments[i]) {
                return 1;
            }
        }
        return 0;
    }
    /** @inheritdoc */
    toString() {
        return `${this.major}.${this.minor}`;
    }
}

/**
 * Provides a {@link LogTarget} that logs to the console.
 */
class ConsoleTarget {
    /**
     * @inheritdoc
     */
    write(entry) {
        switch (entry.level) {
            case "error":
                console.error(...entry.data);
                break;
            case "warn":
                console.warn(...entry.data);
                break;
            default:
                console.log(...entry.data);
        }
    }
}

// Remove any dependencies on node.
const EOL = "\n";
/**
 * Creates a new string log entry formatter.
 * @param opts Options that defines the type for the formatter.
 * @returns The string {@link LogEntryFormatter}.
 */
function stringFormatter(opts) {
    {
        return (entry) => {
            const { data, level, scope } = entry;
            let prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} `;
            if (scope) {
                prefix += `${scope}: `;
            }
            return `${prefix}${reduce(data)}`;
        };
    }
}
/**
 * Stringifies the provided data parameters that make up the log entry.
 * @param data Data parameters.
 * @returns The data represented as a single `string`.
 */
function reduce(data) {
    let result = "";
    let previousWasError = false;
    for (const value of data) {
        // When the value is an error, write the stack.
        if (typeof value === "object" && value instanceof Error) {
            result += `${EOL}${value.stack}`;
            previousWasError = true;
            continue;
        }
        // When the previous was an error, write a new line.
        if (previousWasError) {
            result += EOL;
            previousWasError = false;
        }
        result += typeof value === "object" ? JSON.stringify(value) : value;
        result += " ";
    }
    return result.trimEnd();
}

/* eslint-disable @typescript-eslint/sort-type-constituents */
/**
 * Gets the priority of the specified log level as a number; low numbers signify a higher priority.
 * @param level Log level.
 * @returns The priority as a number.
 */
function defcon(level) {
    switch (level) {
        case "error":
            return 0;
        case "warn":
            return 1;
        case "info":
            return 2;
        case "debug":
            return 3;
        case "trace":
        default:
            return 4;
    }
}

/**
 * Logger capable of forwarding messages to a {@link LogTarget}.
 */
class Logger {
    /**
     * Backing field for the {@link Logger.level}.
     */
    #level;
    /**
     * Options that define the loggers behavior.
     */
    #options;
    /**
     * Scope associated with this {@link Logger}.
     */
    #scope;
    /**
     * Initializes a new instance of the {@link Logger} class.
     * @param opts Options that define the loggers behavior.
     */
    constructor(opts) {
        this.#options = { minimumLevel: "trace", ...opts };
        this.#scope = this.#options.scope === undefined || this.#options.scope.trim() === "" ? "" : this.#options.scope;
        if (typeof this.#options.level !== "function") {
            this.setLevel(this.#options.level);
        }
    }
    /**
     * Gets the {@link LogLevel}.
     * @returns The {@link LogLevel}.
     */
    get level() {
        if (this.#level !== undefined) {
            return this.#level;
        }
        return typeof this.#options.level === "function" ? this.#options.level() : this.#options.level;
    }
    /**
     * Creates a scoped logger with the given {@link scope}; logs created by scoped-loggers include their scope to enable their source to be easily identified.
     * @param scope Value that represents the scope of the new logger.
     * @returns The scoped logger, or this instance when {@link scope} is not defined.
     */
    createScope(scope) {
        scope = scope.trim();
        if (scope === "") {
            return this;
        }
        return new Logger({
            ...this.#options,
            level: () => this.level,
            scope: this.#options.scope ? `${this.#options.scope}->${scope}` : scope,
        });
    }
    /**
     * Writes the arguments as a debug log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    debug(...data) {
        return this.write({ level: "debug", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as error log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    error(...data) {
        return this.write({ level: "error", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as an info log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    info(...data) {
        return this.write({ level: "info", data, scope: this.#scope });
    }
    /**
     * Sets the log-level that determines which logs should be written. The specified level will be inherited by all scoped loggers unless they have log-level explicitly defined.
     * @param level The log-level that determines which logs should be written; when `undefined`, the level will be inherited from the parent logger, or default to the environment level.
     * @returns This instance for chaining.
     */
    setLevel(level) {
        if (level !== undefined && defcon(level) > defcon(this.#options.minimumLevel)) {
            this.#level = "info";
        }
        else {
            this.#level = level;
        }
        return this;
    }
    /**
     * Writes the arguments as a trace log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    trace(...data) {
        return this.write({ level: "trace", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as a warning log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    warn(...data) {
        return this.write({ level: "warn", data, scope: this.#scope });
    }
    /**
     * Writes the log entry.
     * @param entry Log entry to write.
     * @returns This instance for chaining.
     */
    write(entry) {
        if (defcon(entry.level) <= defcon(this.level)) {
            this.#options.targets.forEach((t) => t.write(entry));
        }
        return this;
    }
}

/**
 * Provides a {@link LogTarget} capable of logging to a local file system.
 */
class FileTarget {
    /**
     * File path where logs will be written.
     */
    #filePath;
    /**
     * Options that defines how logs should be written to the local file system.
     */
    #options;
    /**
     * Current size of the logs that have been written to the {@link FileTarget.#filePath}.
     */
    #size = 0;
    /**
     * Initializes a new instance of the {@link FileTarget} class.
     * @param options Options that defines how logs should be written to the local file system.
     */
    constructor(options) {
        this.#options = options;
        this.#filePath = this.getLogFilePath();
        this.reIndex();
    }
    /**
     * @inheritdoc
     */
    write(entry) {
        const fd = fs.openSync(this.#filePath, "a");
        try {
            const msg = this.#options.format(entry);
            fs.writeSync(fd, msg + "\n");
            this.#size += msg.length;
        }
        finally {
            fs.closeSync(fd);
        }
        if (this.#size >= this.#options.maxSize) {
            this.reIndex();
            this.#size = 0;
        }
    }
    /**
     * Gets the file path to an indexed log file.
     * @param index Optional index of the log file to be included as part of the file name.
     * @returns File path that represents the indexed log file.
     */
    getLogFilePath(index = 0) {
        return path.join(this.#options.dest, `${this.#options.fileName}.${index}.log`);
    }
    /**
     * Gets the log files associated with this file target, including past and present.
     * @returns Log file entries.
     */
    getLogFiles() {
        const regex = /^\.(\d+)\.log$/;
        return fs
            .readdirSync(this.#options.dest, { withFileTypes: true })
            .reduce((prev, entry) => {
            if (entry.isDirectory() || entry.name.indexOf(this.#options.fileName) < 0) {
                return prev;
            }
            const match = entry.name.substring(this.#options.fileName.length).match(regex);
            if (match?.length !== 2) {
                return prev;
            }
            prev.push({
                path: path.join(this.#options.dest, entry.name),
                index: parseInt(match[1]),
            });
            return prev;
        }, [])
            .sort(({ index: a }, { index: b }) => {
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }
    /**
     * Re-indexes the existing log files associated with this file target, removing old log files whose index exceeds the {@link FileTargetOptions.maxFileCount}, and renaming the
     * remaining log files, leaving index "0" free for a new log file.
     */
    reIndex() {
        // When the destination directory is new, create it, and return.
        if (!fs.existsSync(this.#options.dest)) {
            fs.mkdirSync(this.#options.dest);
            return;
        }
        const logFiles = this.getLogFiles();
        for (let i = logFiles.length - 1; i >= 0; i--) {
            const log = logFiles[i];
            if (i >= this.#options.maxFileCount - 1) {
                fs.rmSync(log.path);
            }
            else {
                fs.renameSync(log.path, this.getLogFilePath(i + 1));
            }
        }
    }
}

let __isDebugMode = undefined;
/**
 * Determines whether the current plugin is running in a debug environment; this is determined by the command-line arguments supplied to the plugin by Stream. Specifically, the result
 * is `true` when  either `--inspect`, `--inspect-brk` or `--inspect-port` are present as part of the processes' arguments.
 * @returns `true` when the plugin is running in debug mode; otherwise `false`.
 */
function isDebugMode() {
    if (__isDebugMode === undefined) {
        __isDebugMode = process.execArgv.some((arg) => {
            const name = arg.split("=")[0];
            return name === "--inspect" || name === "--inspect-brk" || name === "--inspect-port";
        });
    }
    return __isDebugMode;
}
/**
 * Gets the plugin's unique-identifier from the current working directory.
 * @returns The plugin's unique-identifier.
 */
function getPluginUUID() {
    const name = path.basename(process.cwd());
    const suffixIndex = name.lastIndexOf(".sdPlugin");
    return suffixIndex < 0 ? name : name.substring(0, suffixIndex);
}

// Log all entires to a log file.
const fileTarget = new FileTarget({
    dest: path.join(cwd(), "logs"),
    fileName: getPluginUUID(),
    format: stringFormatter(),
    maxFileCount: 10,
    maxSize: 50 * 1024 * 1024,
});
// Construct the log targets.
const targets = [fileTarget];
if (isDebugMode()) {
    targets.splice(0, 0, new ConsoleTarget());
}
/**
 * Logger responsible for capturing log messages.
 */
const logger = new Logger({
    level: isDebugMode() ? "debug" : "info",
    minimumLevel: isDebugMode() ? "trace" : "debug",
    targets,
});
process.once("uncaughtException", (err) => logger.error("Process encountered uncaught exception", err));

/**
 * Provides a connection between the plugin and the Stream Deck allowing for messages to be sent and received.
 */
class Connection extends EventEmitter {
    /**
     * Private backing field for {@link Connection.registrationParameters}.
     */
    _registrationParameters;
    /**
     * Private backing field for {@link Connection.version}.
     */
    _version;
    /**
     * Used to ensure {@link Connection.connect} is invoked as a singleton; `false` when a connection is occurring or established.
     */
    canConnect = true;
    /**
     * Underlying web socket connection.
     */
    connection = withResolvers();
    /**
     * Logger scoped to the connection.
     */
    logger = logger.createScope("Connection");
    /**
     * Underlying connection information provided to the plugin to establish a connection with Stream Deck.
     * @returns The registration parameters.
     */
    get registrationParameters() {
        return (this._registrationParameters ??= this.getRegistrationParameters());
    }
    /**
     * Version of Stream Deck this instance is connected to.
     * @returns The version.
     */
    get version() {
        return (this._version ??= new Version(this.registrationParameters.info.application.version));
    }
    /**
     * Establishes a connection with the Stream Deck, allowing for the plugin to send and receive messages.
     * @returns A promise that is resolved when a connection has been established.
     */
    async connect() {
        // Ensure we only establish a single connection.
        if (this.canConnect) {
            this.canConnect = false;
            const webSocket = new WebSocket(`ws://127.0.0.1:${this.registrationParameters.port}`);
            webSocket.onmessage = (ev) => this.tryEmit(ev);
            webSocket.onopen = () => {
                webSocket.send(JSON.stringify({
                    event: this.registrationParameters.registerEvent,
                    uuid: this.registrationParameters.pluginUUID,
                }));
                // Web socket established a connection with the Stream Deck and the plugin was registered.
                this.connection.resolve(webSocket);
                this.emit("connected", this.registrationParameters.info);
            };
        }
        await this.connection.promise;
    }
    /**
     * Sends the commands to the Stream Deck, once the connection has been established and registered.
     * @param command Command being sent.
     * @returns `Promise` resolved when the command is sent to Stream Deck.
     */
    async send(command) {
        const connection = await this.connection.promise;
        const message = JSON.stringify(command);
        this.logger.trace(message);
        connection.send(message);
    }
    /**
     * Gets the registration parameters, provided by Stream Deck, that provide information to the plugin, including how to establish a connection.
     * @returns Parsed registration parameters.
     */
    getRegistrationParameters() {
        const params = {
            port: undefined,
            info: undefined,
            pluginUUID: undefined,
            registerEvent: undefined,
        };
        const scopedLogger = logger.createScope("RegistrationParameters");
        for (let i = 0; i < process.argv.length - 1; i++) {
            const param = process.argv[i];
            const value = process.argv[++i];
            switch (param) {
                case RegistrationParameter.Port:
                    scopedLogger.debug(`port=${value}`);
                    params.port = value;
                    break;
                case RegistrationParameter.PluginUUID:
                    scopedLogger.debug(`pluginUUID=${value}`);
                    params.pluginUUID = value;
                    break;
                case RegistrationParameter.RegisterEvent:
                    scopedLogger.debug(`registerEvent=${value}`);
                    params.registerEvent = value;
                    break;
                case RegistrationParameter.Info:
                    scopedLogger.debug(`info=${value}`);
                    params.info = JSON.parse(value);
                    break;
                default:
                    i--;
                    break;
            }
        }
        const invalidArgs = [];
        const validate = (name, value) => {
            if (value === undefined) {
                invalidArgs.push(name);
            }
        };
        validate(RegistrationParameter.Port, params.port);
        validate(RegistrationParameter.PluginUUID, params.pluginUUID);
        validate(RegistrationParameter.RegisterEvent, params.registerEvent);
        validate(RegistrationParameter.Info, params.info);
        if (invalidArgs.length > 0) {
            throw new Error(`Unable to establish a connection with Stream Deck, missing command line arguments: ${invalidArgs.join(", ")}`);
        }
        return params;
    }
    /**
     * Attempts to emit the {@link ev} that was received from the {@link Connection.connection}.
     * @param ev Event message data received from Stream Deck.
     */
    tryEmit(ev) {
        try {
            const message = JSON.parse(ev.data.toString());
            if (message.event) {
                this.logger.trace(ev.data.toString());
                this.emit(message.event, message);
            }
            else {
                this.logger.warn(`Received unknown message: ${ev.data}`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to parse message: ${ev.data}`, err);
        }
    }
}
const connection = new Connection();

/**
 * Provides information for events received from Stream Deck.
 */
class Event {
    /**
     * Event that occurred.
     */
    type;
    /**
     * Initializes a new instance of the {@link Event} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        this.type = source.event;
    }
}

/**
 * Provides information for an event relating to an action.
 */
class ActionWithoutPayloadEvent extends Event {
    action;
    /**
     * Initializes a new instance of the {@link ActionWithoutPayloadEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
    }
}
/**
 * Provides information for an event relating to an action.
 */
class ActionEvent extends ActionWithoutPayloadEvent {
    /**
     * Provides additional information about the event that occurred, e.g. how many `ticks` the dial was rotated, the current `state` of the action, etc.
     */
    payload;
    /**
     * Initializes a new instance of the {@link ActionEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(action, source);
        this.payload = source.payload;
    }
}

const manifest$1 = new Lazy(() => {
    const path = join(process.cwd(), "manifest.json");
    if (!existsSync(path)) {
        throw new Error("Failed to read manifest.json as the file does not exist.");
    }
    try {
        return JSON.parse(readFileSync(path, {
            encoding: "utf-8",
            flag: "r",
        }).toString());
    }
    catch (e) {
        if (e instanceof SyntaxError) {
            return null;
        }
        else {
            throw e;
        }
    }
});
const softwareMinimumVersion = new Lazy(() => {
    if (manifest$1.value === null) {
        return null;
    }
    return new Version(manifest$1.value.Software.MinimumVersion);
});
/**
 * Gets the SDK version that the plugin requires.
 * @returns SDK version; otherwise `null` when the plugin is DRM protected.
 */
function getSDKVersion() {
    return manifest$1.value?.SDKVersion ?? null;
}
/**
 * Gets the minimum version that the plugin requires.
 * @returns Minimum required version; otherwise `null` when the plugin is DRM protected.
 */
function getSoftwareMinimumVersion() {
    return softwareMinimumVersion.value;
}
/**
 * Gets the manifest associated with the plugin.
 * @returns The manifest; otherwise `null` when the plugin is DRM protected.
 */
function getManifest() {
    return manifest$1.value;
}

/**
 * Configuration shared by action components that must not depend on the plugin settings module.
 */
const actionConfig = {
    /**
     * Determines whether settings requests should use message identifiers and action settings cache behavior.
     */
    useExperimentalMessageIdentifiers: false,
};

const __items$1 = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyActionStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyActionStore}.
     */
    constructor() {
        super(__items$1);
    }
    /**
     * Gets the action with the specified identifier.
     * @param id Identifier of action to search for.
     * @returns The action, when present; otherwise `undefined`.
     */
    getActionById(id) {
        return __items$1.get(id);
    }
}
/**
 * Provides a store of Stream Deck actions.
 */
class ActionStore extends ReadOnlyActionStore {
    /**
     * Deletes the action from the store.
     * @param id The action's identifier.
     */
    delete(id) {
        __items$1.delete(id);
    }
    /**
     * Adds the action to the store.
     * @param action The action.
     */
    set(action) {
        __items$1.set(action.id, action);
    }
}
/**
 * Singleton instance of the action store.
 */
const actionStore = new ActionStore();

/**
 * Provides information for events relating to an application.
 */
class ApplicationEvent extends Event {
    /**
     * Monitored application that was launched/terminated.
     */
    application;
    /**
     * Initializes a new instance of the {@link ApplicationEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.application = source.payload.application;
    }
}

/**
 * Provides information for events relating to a device.
 */
class DeviceEvent extends Event {
    device;
    /**
     * Initializes a new instance of the {@link DeviceEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     * @param device Device that event is associated with.
     */
    constructor(source, device) {
        super(source);
        this.device = device;
    }
}

/**
 * Event information received from Stream Deck as part of a deep-link message being routed to the plugin.
 */
class DidReceiveDeepLinkEvent extends Event {
    /**
     * Deep-link URL routed from Stream Deck.
     */
    url;
    /**
     * Initializes a new instance of the {@link DidReceiveDeepLinkEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.url = new DeepLinkURL(source.payload.url);
    }
}
const PREFIX = "streamdeck://";
/**
 * Provides information associated with a URL received as part of a deep-link message, conforming to the URI syntax defined within RFC-3986 (https://datatracker.ietf.org/doc/html/rfc3986#section-3).
 */
class DeepLinkURL {
    /**
     * Fragment of the URL, with the number sign (#) omitted. For example, a URL of "/test#heading" would result in a {@link DeepLinkURL.fragment} of "heading".
     */
    fragment;
    /**
     * Original URL. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.href} of "/test?one=two#heading".
     */
    href;
    /**
     * Path of the URL; the full URL with the query and fragment omitted. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.path} of "/test".
     */
    path;
    /**
     * Query of the URL, with the question mark (?) omitted. For example, a URL of "/test?name=elgato&key=123" would result in a {@link DeepLinkURL.query} of "name=elgato&key=123".
     * See also {@link DeepLinkURL.queryParameters}.
     */
    query;
    /**
     * Query string parameters parsed from the URL. See also {@link DeepLinkURL.query}.
     */
    queryParameters;
    /**
     * Initializes a new instance of the {@link DeepLinkURL} class.
     * @param url URL of the deep-link, with the schema and authority omitted.
     */
    constructor(url) {
        const refUrl = new URL(`${PREFIX}${url}`);
        this.fragment = refUrl.hash.substring(1);
        this.href = refUrl.href.substring(PREFIX.length);
        this.path = DeepLinkURL.parsePath(this.href);
        this.query = refUrl.search.substring(1);
        this.queryParameters = refUrl.searchParams;
    }
    /**
     * Parses the {@link DeepLinkURL.path} from the specified {@link href}.
     * @param href Partial URL that contains the path to parse.
     * @returns The path of the URL.
     */
    static parsePath(href) {
        const indexOf = (char) => {
            const index = href.indexOf(char);
            return index >= 0 ? index : href.length;
        };
        return href.substring(0, Math.min(indexOf("?"), indexOf("#")));
    }
}

/**
 * Provides event information for when the plugin received the global settings.
 */
class DidReceiveGlobalSettingsEvent extends Event {
    /**
     * Settings associated with the event.
     */
    settings;
    /**
     * Initializes a new instance of the {@link DidReceiveGlobalSettingsEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.settings = source.payload.settings;
    }
}

/**
 * Provides information for an event triggered by a message being sent to the plugin, from the property inspector.
 */
class SendToPluginEvent extends Event {
    action;
    /**
     * Payload sent from the property inspector.
     */
    payload;
    /**
     * Initializes a new instance of the {@link SendToPluginEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
        this.payload = source.payload;
    }
}

/**
 * Validates the `SDKVersion` within the manifest fulfils the minimum required version for the specified
 * feature; when the version is not fulfilled, an error is thrown with the feature formatted into the message.
 * @param minimumVersion Minimum required SDKVersion.
 * @param feature Feature that requires the version.
 */
function requiresSDKVersion(minimumVersion, feature) {
    const sdkVersion = getSDKVersion();
    if (sdkVersion !== null && minimumVersion > sdkVersion) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires manifest SDK version ${minimumVersion} or higher, but found version ${sdkVersion}; please update the "SDKVersion" in the plugin's manifest to ${minimumVersion} or higher.`);
    }
}
/**
 * Validates the {@link streamDeckVersion} and manifest's `Software.MinimumVersion` are at least the {@link minimumVersion};
 * when the version is not fulfilled, an error is thrown with the {@link feature} formatted into the message.
 * @param minimumVersion Minimum required version.
 * @param streamDeckVersion Actual application version.
 * @param feature Feature that requires the version.
 */
function requiresVersion(minimumVersion, streamDeckVersion, feature) {
    const required = {
        major: Math.floor(minimumVersion),
        minor: Number(minimumVersion.toString().split(".").at(1) ?? 0), // Account for JavaScript's floating point precision.
        patch: 0,
        build: 0,
    };
    if (streamDeckVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher, but current version is ${streamDeckVersion.major}.${streamDeckVersion.minor}; please update Stream Deck and the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
    const softwareMinimumVersion = getSoftwareMinimumVersion();
    if (softwareMinimumVersion !== null && softwareMinimumVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher; please update the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
}

const settings = {
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     * @returns The value.
     */
    get useExperimentalMessageIdentifiers() {
        return actionConfig.useExperimentalMessageIdentifiers;
    },
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     */
    set useExperimentalMessageIdentifiers(value) {
        requiresVersion(7.1, connection.version, "Message identifiers");
        actionConfig.useExperimentalMessageIdentifiers = value;
    },
    /**
     * Gets the global settings associated with the plugin.
     * @template T The type of global settings associated with the plugin.
     * @returns Promise containing the plugin's global settings.
     */
    getGlobalSettings: () => {
        return new Promise((resolve) => {
            connection.once("didReceiveGlobalSettings", (ev) => resolve(ev.payload.settings));
            connection.send({
                event: "getGlobalSettings",
                context: connection.registrationParameters.pluginUUID,
                id: randomUUID(),
            });
        });
    },
    /**
     * Occurs when the global settings are requested, or when the the global settings were updated in
     * the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveGlobalSettings: (listener) => {
        return connection.disposableOn("didReceiveGlobalSettings", (ev) => {
            // Do nothing when the global settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            listener(new DidReceiveGlobalSettingsEvent(ev));
        });
    },
    /**
     * Occurs when the settings associated with an action instance are requested, or when the the settings
     * were updated in the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveSettings: (listener) => {
        return connection.disposableOn("didReceiveSettings", (ev) => {
            // Do nothing when the action's settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    },
    /**
     * Sets the global settings associated the plugin; these settings are only available to this plugin,
     * and should be used to persist information securely.
     * @param settings Settings to save.
     * @example
     * streamDeck.settings.setGlobalSettings({
     *   apiKey,
     *   connectedDate: new Date()
     * })
     */
    setGlobalSettings: async (settings) => {
        await connection.send({
            event: "setGlobalSettings",
            context: connection.registrationParameters.pluginUUID,
            payload: settings,
        });
    },
};

/**
 * Controller capable of sending/receiving payloads with the property inspector, and listening for events.
 */
class UIController {
    /**
     * Action associated with the current property inspector.
     */
    #action;
    /**
     * To overcome event races, the debounce counter keeps track of appear vs disappear events, ensuring
     * we only clear the current ui when an equal number of matching disappear events occur.
     */
    #appearanceStackCount = 0;
    /**
     * Initializes a new instance of the {@link UIController} class.
     */
    constructor() {
        // Track the action for the current property inspector.
        this.onDidAppear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount++;
            }
            else {
                this.#appearanceStackCount = 1;
                this.#action = ev.action;
            }
        });
        this.onDidDisappear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount--;
                if (this.#appearanceStackCount <= 0) {
                    this.#action = undefined;
                }
            }
        });
    }
    /**
     * Gets the action associated with the current property.
     * @returns The action; otherwise `undefined` when a property inspector is not visible.
     */
    get action() {
        return this.#action;
    }
    /**
     * Occurs when the property inspector associated with the action becomes visible, i.e. the user
     * selected an action in the Stream Deck application..
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidAppear(listener) {
        return connection.disposableOn("propertyInspectorDidAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the property inspector associated with the action disappears, i.e. the user unselected
     * the action in the Stream Deck application.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidDisappear(listener) {
        return connection.disposableOn("propertyInspectorDidDisappear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when a message was sent to the plugin _from_ the property inspector.
     * @template TPayload The type of the payload received from the property inspector.
     * @template TSettings The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onSendToPlugin(listener) {
        return connection.disposableOn("sendToPlugin", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new SendToPluginEvent(action, ev));
            }
        });
    }
    /**
     * Sends the payload to the property inspector; the payload is only sent when the property inspector
     * is visible for an action provided by this plugin.
     * @param payload Payload to send.
     */
    async sendToPropertyInspector(payload) {
        if (this.#action) {
            await connection.send({
                event: "sendToPropertyInspector",
                context: this.#action.id,
                payload,
            });
        }
    }
    /**
     * Determines whether the specified action is the action for the current property inspector.
     * @param action Action to check against.
     * @returns `true` when the actions are the same.
     */
    #isCurrent(action) {
        return (this.#action?.id === action.id &&
            this.#action?.manifestId === action.manifestId &&
            this.#action?.device?.id === action.device.id);
    }
}
const ui = new UIController();

/**
 * Provides a cache for action settings, keyed by action instance identifier.
 */
class SettingsCache {
    /**
     * Underlying map of action ID to cached settings.
     */
    #entries = new Map();
    /**
     * Removes the cached settings for the specified action.
     * @param id Action instance identifier.
     */
    delete(id) {
        this.#entries.delete(id);
    }
    /**
     * Gets the cached settings for the specified action.
     * @param id Action instance identifier.
     * @returns The cached settings when present; otherwise `undefined`.
     */
    get(id) {
        const settings = this.#entries.get(id);
        return settings !== undefined ? structuredClone(settings) : undefined;
    }
    /**
     * Sets the cached settings for the specified action.
     * @param id Action instance identifier.
     * @param settings The settings to cache.
     */
    set(id, settings) {
        this.#entries.set(id, structuredClone(settings));
    }
}
/**
 * Singleton instance of the settings cache.
 */
const settingsCache = new SettingsCache();

const __items = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyDeviceStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyDeviceStore}.
     */
    constructor() {
        super(__items);
    }
    /**
     * Gets the Stream Deck {@link Device} associated with the specified {@link deviceId}.
     * @param deviceId Identifier of the Stream Deck device.
     * @returns The Stream Deck device information; otherwise `undefined` if a device with the {@link deviceId} does not exist.
     */
    getDeviceById(deviceId) {
        return __items.get(deviceId);
    }
}
/**
 * Provides a store of Stream Deck devices.
 */
class DeviceStore extends ReadOnlyDeviceStore {
    /**
     * Adds the device to the store.
     * @param device The device.
     */
    set(device) {
        __items.set(device.id, device);
    }
}
/**
 * Singleton instance of the device store.
 */
const deviceStore = new DeviceStore();

/**
 * Provides information about an instance of a Stream Deck action.
 */
class ActionContext {
    /**
     * Device the action is associated with.
     */
    #device;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@link ActionContext} class.
     * @param source Source of the action.
     */
    constructor(source) {
        this.#source = source;
        const device = deviceStore.getDeviceById(source.device);
        if (!device) {
            throw new Error(`Failed to initialize action; device ${source.device} not found`);
        }
        this.#device = device;
    }
    /**
     * Type of the action.
     * - `Keypad` is a key.
     * - `Encoder` is a dial and portion of the touch strip.
     * @returns Controller type.
     */
    get controllerType() {
        return this.#source.payload.controller;
    }
    /**
     * Stream Deck device the action is positioned on.
     * @returns Stream Deck device.
     */
    get device() {
        return this.#device;
    }
    /**
     * Action instance identifier.
     * @returns Identifier.
     */
    get id() {
        return this.#source.context;
    }
    /**
     * Manifest identifier (UUID) for this action type.
     * @returns Manifest identifier.
     */
    get manifestId() {
        return this.#source.action;
    }
    /**
     * Converts this instance to a serializable object.
     * @returns The serializable object.
     */
    toJSON() {
        return {
            controllerType: this.controllerType,
            device: this.device,
            id: this.id,
            manifestId: this.manifestId,
        };
    }
}

const REQUEST_TIMEOUT = 15 * 1000; // 15s
/**
 * Provides a contextualized instance of an {@link Action}, allowing for direct communication with the Stream Deck.
 * @template T The type of settings associated with the action.
 */
class Action extends ActionContext {
    /**
     * Gets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @returns The resources.
     */
    async getResources() {
        requiresVersion(7.1, connection.version, "getResources");
        const res = await this.#fetch("getResources", "didReceiveResources");
        return res.payload.resources;
    }
    /**
     * Gets the settings associated this action instance.
     * @template U The type of settings associated with the action.D
     * @returns Promise containing the action instance's settings.
     */
    async getSettings() {
        if (actionConfig.useExperimentalMessageIdentifiers) {
            const cached = settingsCache.get(this.id);
            if (cached !== undefined) {
                logger.trace(JSON.stringify({
                    event: "getSettings",
                    context: this.id,
                    source: "cache",
                    settings: cached,
                }));
                return cached;
            }
        }
        const res = await this.#fetch("getSettings", "didReceiveSettings");
        return res.payload.settings;
    }
    /**
     * Determines whether this instance is a dial.
     * @returns `true` when this instance is a dial; otherwise `false`.
     */
    isDial() {
        return this.controllerType === "Encoder";
    }
    /**
     * Determines whether this instance is a key.
     * @returns `true` when this instance is a key; otherwise `false`.
     */
    isKey() {
        return this.controllerType === "Keypad";
    }
    /**
     * Sets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @example
     * action.setResources({
     *   fileOne: "c:\\hello-world.txt",
     *   anotherFile: "c:\\icon.png"
     * });
     * @param resources The resources as a map of file paths.
     * @returns `Promise` resolved when the resources are saved to Stream Deck.
     */
    setResources(resources) {
        requiresVersion(7.1, connection.version, "setResources");
        return connection.send({
            event: "setResources",
            context: this.id,
            payload: resources,
        });
    }
    /**
     * Sets the settings associated with this action instance. Use in conjunction with {@link Action.getSettings}.
     * @param value Settings to persist.
     * @returns `Promise` resolved when the settings are sent to Stream Deck.
     */
    setSettings(value) {
        settingsCache.delete(this.id);
        return connection.send({
            event: "setSettings",
            context: this.id,
            payload: value,
        });
    }
    /**
     * Temporarily shows an alert (i.e. warning), in the form of an exclamation mark in a yellow triangle, on this action instance. Used to provide visual feedback when an action failed.
     * @returns `Promise` resolved when the request to show an alert has been sent to Stream Deck.
     */
    showAlert() {
        return connection.send({
            event: "showAlert",
            context: this.id,
        });
    }
    /**
     * Fetches information from Stream Deck by sending the command, and awaiting the event.
     * @param command Name of the event (command) to send.
     * @param event Name of the event to await.
     * @returns The payload from the received event.
     */
    async #fetch(command, event) {
        const { resolve, reject, promise } = withResolvers();
        // Set a timeout to prevent endless awaiting.
        const timeoutId = setTimeout(() => {
            listener.dispose();
            reject("The request timed out");
        }, REQUEST_TIMEOUT);
        // Listen for an event that can resolve the request.
        const listener = connection.disposableOn(event, (ev) => {
            // Make sure the received event is for this action.
            if (ev.context == this.id) {
                clearTimeout(timeoutId);
                listener.dispose();
                resolve(ev);
            }
        });
        // Send the request; specifying an id signifies its a request.
        await connection.send({
            event: command,
            context: this.id,
            id: randomUUID(),
        });
        return promise;
    }
}

/**
 * Provides a contextualized instance of a dial action.
 * @template T The type of settings associated with the action.
 */
class DialAction extends Action {
    /**
     * Private backing field for {@link DialAction.coordinates}.
     */
    #coordinates;
    /**
     * Initializes a new instance of the {@see DialAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Encoder") {
            throw new Error("Unable to create DialAction; source event is not a Encoder");
        }
        this.#coordinates = Object.freeze(source.payload.coordinates);
    }
    /**
     * Coordinates of the dial.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Sets the feedback for the current layout associated with this action instance, allowing for the visual items to be updated. Layouts are a powerful way to provide dynamic information
     * to users, and can be assigned in the manifest, or dynamically via {@link Action.setFeedbackLayout}.
     *
     * The {@link feedback} payload defines which items within the layout will be updated, and are identified by their property name (defined as the `key` in the layout's definition).
     * The values can either by a complete new definition, a `string` for layout item types of `text` and `pixmap`, or a `number` for layout item types of `bar` and `gbar`.
     * @param feedback Object containing information about the layout items to be updated.
     * @returns `Promise` resolved when the request to set the {@link feedback} has been sent to Stream Deck.
     */
    setFeedback(feedback) {
        return connection.send({
            event: "setFeedback",
            context: this.id,
            payload: feedback,
        });
    }
    /**
     * Sets the layout associated with this action instance. The layout must be either a built-in layout identifier, or path to a local layout JSON file within the plugin's folder.
     * Use in conjunction with {@link Action.setFeedback} to update the layout's current items' settings.
     * @param layout Name of a pre-defined layout, or relative path to a custom one.
     * @returns `Promise` resolved when the new layout has been sent to Stream Deck.
     */
    setFeedbackLayout(layout) {
        return connection.send({
            event: "setFeedbackLayout",
            context: this.id,
            payload: {
                layout,
            },
        });
    }
    /**
     * Sets the {@link image} to be display for this action instance within Stream Deck app.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title) {
        return this.setFeedback({ title });
    }
    /**
     * Sets the trigger (interaction) {@link descriptions} associated with this action instance. Descriptions are shown within the Stream Deck application, and informs the user what
     * will happen when they interact with the action, e.g. rotate, touch, etc. When {@link descriptions} is `undefined`, the descriptions will be reset to the values provided as part
     * of the manifest.
     *
     * NB: Applies to encoders (dials / touchscreens) found on Stream Deck + devices.
     * @param descriptions Descriptions that detail the action's interaction.
     * @returns `Promise` resolved when the request to set the {@link descriptions} has been sent to Stream Deck.
     */
    setTriggerDescription(descriptions) {
        return connection.send({
            event: "setTriggerDescription",
            context: this.id,
            payload: descriptions || {},
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
        };
    }
}

/**
 * Provides a contextualized instance of a key action.
 * @template T The type of settings associated with the action.
 */
class KeyAction extends Action {
    /**
     * Private backing field for {@link KeyAction.coordinates}.
     */
    #coordinates;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@see KeyAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Keypad") {
            throw new Error("Unable to create KeyAction; source event is not a Keypad");
        }
        this.#coordinates = !source.payload.isInMultiAction ? Object.freeze(source.payload.coordinates) : undefined;
        this.#source = source;
    }
    /**
     * Coordinates of the key; otherwise `undefined` when the action is part of a multi-action.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Determines whether the key is part of a multi-action.
     * @returns `true` when in a multi-action; otherwise `false`.
     */
    isInMultiAction() {
        return this.#source.payload.isInMultiAction;
    }
    /**
     * Sets the {@link image} to be display for this action instance.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @param options Additional options that define where and how the image should be rendered.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image, options) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
                ...options,
            },
        });
    }
    /**
     * Sets the current {@link state} of this action instance; only applies to actions that have multiple states defined within the manifest.
     * @param state State to set; this be either 0, or 1.
     * @returns `Promise` resolved when the request to set the state of an action instance has been sent to Stream Deck.
     */
    setState(state) {
        return connection.send({
            event: "setState",
            context: this.id,
            payload: {
                state,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display; when `undefined` the title within the manifest will be used.
     * @param options Additional options that define where and how the title should be rendered.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title, options) {
        return connection.send({
            event: "setTitle",
            context: this.id,
            payload: {
                title,
                ...options,
            },
        });
    }
    /**
     * Temporarily shows an "OK" (i.e. success), in the form of a check-mark in a green circle, on this action instance. Used to provide visual feedback when an action successfully
     * executed.
     * @returns `Promise` resolved when the request to show an "OK" has been sent to Stream Deck.
     */
    showOk() {
        return connection.send({
            event: "showOk",
            context: this.id,
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
            isInMultiAction: this.isInMultiAction(),
        };
    }
}

const manifest = new Lazy(() => getManifest());
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class ActionService extends ReadOnlyActionStore {
    /**
     * Initializes a new instance of the {@link ActionService} class.
     */
    constructor() {
        super();
        // Adds the action to the store.
        connection.prependListener("willAppear", (ev) => {
            const action = ev.payload.controller === "Encoder" ? new DialAction(ev) : new KeyAction(ev);
            actionStore.set(action);
            if (actionConfig.useExperimentalMessageIdentifiers) {
                settingsCache.set(ev.context, ev.payload.settings);
            }
        });
        // Update the settings cache when settings are received.
        connection.prependListener("didReceiveSettings", (ev) => {
            if (actionConfig.useExperimentalMessageIdentifiers) {
                settingsCache.set(ev.context, ev.payload.settings);
            }
        });
        // Remove the action from the store.
        connection.prependListener("willDisappear", (ev) => {
            actionStore.delete(ev.context);
            settingsCache.delete(ev.context);
        });
    }
    /**
     * Occurs when the user presses a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialDown(listener) {
        return connection.disposableOn("dialDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user rotates a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialRotate(listener) {
        return connection.disposableOn("dialRotate", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialUp(listener) {
        return connection.disposableOn("dialUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the resources were updated within the property inspector.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidReceiveResources(listener) {
        return connection.disposableOn("didReceiveResources", (ev) => {
            // When the id is defined, the resources were requested, so we don't propagate the event.
            if (ev.id !== undefined) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user presses a action down.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyDown(listener) {
        return connection.disposableOn("keyDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed action.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyUp(listener) {
        return connection.disposableOn("keyUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user updates an action's title settings in the Stream Deck application. See also {@link Action.setTitle}.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTitleParametersDidChange(listener) {
        return connection.disposableOn("titleParametersDidChange", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user taps the touchscreen (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTouchTap(listener) {
        return connection.disposableOn("touchTap", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action appears on the Stream Deck due to the user navigating to another page, profile, folder, etc. This also occurs during startup if the action is on the "front
     * page". An action refers to _all_ types of actions, e.g. keys, dials,
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillAppear(listener) {
        return connection.disposableOn("willAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action disappears from the Stream Deck due to the user navigating to another page, profile, folder, etc. An action refers to _all_ types of actions, e.g. keys,
     * dials, touchscreens, pedals, etc.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillDisappear(listener) {
        return connection.disposableOn("willDisappear", (ev) => listener(new ActionEvent(new ActionContext(ev), ev)));
    }
    /**
     * Registers the action with the Stream Deck, routing all events associated with the {@link SingletonAction.manifestId} to the specified {@link action}.
     * @param action The action to register.
     * @example
     * ＠action({ UUID: "com.elgato.test.action" })
     * class MyCustomAction extends SingletonAction {
     *     export function onKeyDown(ev: KeyDownEvent) {
     *         // Do some awesome thing.
     *     }
     * }
     *
     * streamDeck.actions.registerAction(new MyCustomAction());
     */
    registerAction(action) {
        if (action.manifestId === undefined) {
            throw new Error("The action's manifestId cannot be undefined.");
        }
        if (manifest.value !== null && !manifest.value.Actions.some((a) => a.UUID === action.manifestId)) {
            throw new Error(`The action's manifestId was not found within the manifest: ${action.manifestId}`);
        }
        // Routes an event to the action, when the applicable listener is defined on the action.
        const { manifestId } = action;
        const route = (fn, listener) => {
            const boundedListener = listener?.bind(action);
            if (boundedListener === undefined) {
                return;
            }
            fn.bind(action)(async (ev) => {
                if (ev.action.manifestId == manifestId) {
                    await boundedListener(ev);
                }
            });
        };
        // Route each of the action events.
        route(this.onDialDown, action.onDialDown);
        route(this.onDialUp, action.onDialUp);
        route(this.onDialRotate, action.onDialRotate);
        route(ui.onSendToPlugin, action.onSendToPlugin);
        route(this.onDidReceiveResources, action.onDidReceiveResources);
        route(settings.onDidReceiveSettings, action.onDidReceiveSettings);
        route(this.onKeyDown, action.onKeyDown);
        route(this.onKeyUp, action.onKeyUp);
        route(ui.onDidAppear, action.onPropertyInspectorDidAppear);
        route(ui.onDidDisappear, action.onPropertyInspectorDidDisappear);
        route(this.onTitleParametersDidChange, action.onTitleParametersDidChange);
        route(this.onTouchTap, action.onTouchTap);
        route(this.onWillAppear, action.onWillAppear);
        route(this.onWillDisappear, action.onWillDisappear);
    }
}
/**
 * Service for interacting with Stream Deck actions.
 */
const actionService = new ActionService();

/**
 * Provides information about a device.
 */
class Device {
    /**
     * Private backing field for {@link Device.isConnected}.
     */
    #isConnected = false;
    /**
     * Private backing field for the device's information.
     */
    #info;
    /**
     * Unique identifier of the device.
     */
    id;
    /**
     * Initializes a new instance of the {@link Device} class.
     * @param id Device identifier.
     * @param info Information about the device.
     * @param isConnected Determines whether the device is connected.
     */
    constructor(id, info, isConnected) {
        this.id = id;
        this.#info = info;
        this.#isConnected = isConnected;
        // Set connected.
        connection.prependListener("deviceDidConnect", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
                this.#isConnected = true;
            }
        });
        // Track changes.
        connection.prependListener("deviceDidChange", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
            }
        });
        // Set disconnected.
        connection.prependListener("deviceDidDisconnect", (ev) => {
            if (ev.device === this.id) {
                this.#isConnected = false;
            }
        });
    }
    /**
     * Actions currently visible on the device.
     * @returns Collection of visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.device.id === this.id);
    }
    /**
     * Determines whether the device is currently connected.
     * @returns `true` when the device is connected; otherwise `false`.
     */
    get isConnected() {
        return this.#isConnected;
    }
    /**
     * Name of the device, as specified by the user in the Stream Deck application.
     * @returns Name of the device.
     */
    get name() {
        return this.#info.name;
    }
    /**
     * Number of action slots, excluding dials / touchscreens, available to the device.
     * @returns Size of the device.
     */
    get size() {
        return this.#info.size;
    }
    /**
     * Type of the device that was connected, e.g. Stream Deck +, Stream Deck Pedal, etc. See {@link DeviceType}.
     * @returns Type of the device.
     */
    get type() {
        return this.#info.type;
    }
}

/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class DeviceService extends ReadOnlyDeviceStore {
    /**
     * Initializes a new instance of the {@link DeviceService}.
     */
    constructor() {
        super();
        // Add the devices from registration parameters.
        connection.once("connected", (info) => {
            info.devices.forEach((dev) => deviceStore.set(new Device(dev.id, dev, false)));
        });
        // Add new devices that were connected.
        connection.on("deviceDidConnect", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, true));
            }
        });
        // Add new devices that were changed (Virtual Stream Deck event race).
        connection.on("deviceDidChange", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, false));
            }
        });
    }
    /**
     * Occurs when a Stream Deck device changed, for example its name or size.
     *
     * Available from Stream Deck 7.0.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidChange(listener) {
        requiresVersion(7.0, connection.version, "onDeviceDidChange");
        return connection.disposableOn("deviceDidChange", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is connected. See also {@link DeviceService.onDeviceDidConnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidConnect(listener) {
        return connection.disposableOn("deviceDidConnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is disconnected. See also {@link DeviceService.onDeviceDidDisconnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidDisconnect(listener) {
        return connection.disposableOn("deviceDidDisconnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
}
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
const deviceService = new DeviceService();

/**
 * Loads a locale from the file system.
 * @param language Language to load.
 * @returns Contents of the locale.
 */
function fileSystemLocaleProvider(language) {
    const filePath = path.join(process.cwd(), `${language}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        // Parse the translations from the file.
        const contents = fs.readFileSync(filePath, { flag: "r" })?.toString();
        return parseLocalizations(contents);
    }
    catch (err) {
        logger.error(`Failed to load translations from ${filePath}`, err);
        return null;
    }
}
/**
 * Parses the localizations from the specified contents, or throws a `TypeError` when unsuccessful.
 * @param contents Contents that represent the stringified JSON containing the localizations.
 * @returns The localizations; otherwise a `TypeError`.
 */
function parseLocalizations(contents) {
    const json = JSON.parse(contents);
    if (json !== undefined && json !== null && typeof json === "object" && "Localization" in json) {
        return json["Localization"];
    }
    throw new TypeError(`Translations must be a JSON object nested under a property named "Localization"`);
}

/**
 * Requests the Stream Deck switches the current profile of the specified {@link deviceId} to the {@link profile}; when no {@link profile} is provided the previously active profile
 * is activated.
 *
 * NB: Plugins may only switch to profiles distributed with the plugin, as defined within the manifest, and cannot access user-defined profiles.
 * @param deviceId Unique identifier of the device where the profile should be set.
 * @param profile Optional name of the profile to switch to; when `undefined` the previous profile will be activated. Name must be identical to the one provided in the manifest.
 * @param page Optional page to show when switching to the {@link profile}, indexed from 0. When `undefined`, the page that was previously visible (when switching away from the
 * profile) will be made visible.
 * @returns `Promise` resolved when the request to switch the `profile` has been sent to Stream Deck.
 */
function switchToProfile(deviceId, profile, page) {
    if (page !== undefined) {
        requiresVersion(6.5, connection.version, "Switching to a profile page");
    }
    return connection.send({
        event: "switchToProfile",
        context: connection.registrationParameters.pluginUUID,
        device: deviceId,
        payload: {
            page,
            profile,
        },
    });
}

var profiles = /*#__PURE__*/Object.freeze({
    __proto__: null,
    switchToProfile: switchToProfile
});

/**
 * Occurs when a monitored application is launched. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidTerminate}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidLaunch(listener) {
    return connection.disposableOn("applicationDidLaunch", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a monitored application terminates. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidLaunch}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidTerminate(listener) {
    return connection.disposableOn("applicationDidTerminate", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a deep-link message is routed to the plugin from Stream Deck. One-way deep-link messages can be sent to plugins from external applications using the URL format
 * `streamdeck://plugins/message/<PLUGIN_UUID>/{MESSAGE}`.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onDidReceiveDeepLink(listener) {
    requiresVersion(6.5, connection.version, "Receiving deep-link messages");
    return connection.disposableOn("didReceiveDeepLink", (ev) => listener(new DidReceiveDeepLinkEvent(ev)));
}
/**
 * Occurs when the computer wakes up.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onSystemDidWakeUp(listener) {
    return connection.disposableOn("systemDidWakeUp", (ev) => listener(new Event(ev)));
}
/**
 * Opens the specified `url` in the user's default browser.
 * @param url URL to open.
 * @returns `Promise` resolved when the request to open the `url` has been sent to Stream Deck.
 */
function openUrl(url) {
    return connection.send({
        event: "openUrl",
        payload: {
            url,
        },
    });
}
/**
 * Gets the secrets associated with the plugin.
 * @returns `Promise` resolved with the secrets associated with the plugin.
 */
function getSecrets() {
    requiresVersion(6.9, connection.version, "Secrets");
    requiresSDKVersion(3, "Secrets");
    return new Promise((resolve) => {
        connection.once("didReceiveSecrets", (ev) => resolve(ev.payload.secrets));
        connection.send({
            event: "getSecrets",
            context: connection.registrationParameters.pluginUUID,
        });
    });
}

var system = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getSecrets: getSecrets,
    onApplicationDidLaunch: onApplicationDidLaunch,
    onApplicationDidTerminate: onApplicationDidTerminate,
    onDidReceiveDeepLink: onDidReceiveDeepLink,
    onSystemDidWakeUp: onSystemDidWakeUp,
    openUrl: openUrl
});

/**
 * Provides the main bridge between the plugin and the Stream Deck allowing the plugin to send requests and receive events, e.g. when the user presses an action.
 * @template T The type of settings associated with the action.
 */
class SingletonAction {
    /**
     * The universally-unique value that identifies the action within the manifest.
     */
    manifestId;
    /**
     * Gets the visible actions with the `manifestId` that match this instance's.
     * @returns The visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.manifestId === this.manifestId);
    }
}

let i18n;
const streamDeck = {
    /**
     * Namespace for event listeners and functionality relating to Stream Deck actions.
     * @returns Actions namespace.
     */
    get actions() {
        return actionService;
    },
    /**
     * Namespace for interacting with Stream Deck devices.
     * @returns Devices namespace.
     */
    get devices() {
        return deviceService;
    },
    /**
     * Internalization provider, responsible for managing localizations and translating resources.
     * @returns Internalization provider.
     */
    get i18n() {
        return (i18n ??= new I18nProvider(this.info.application.language, fileSystemLocaleProvider));
    },
    /**
     * Registration and application information provided by Stream Deck during initialization.
     * @returns Registration information.
     */
    get info() {
        return connection.registrationParameters.info;
    },
    /**
     * Logger responsible for capturing log messages.
     * @returns The logger.
     */
    get logger() {
        return logger;
    },
    /**
     * Namespace for Stream Deck profiles.
     * @returns Profiles namespace.
     */
    get profiles() {
        return profiles;
    },
    /**
     * Namespace for persisting settings within Stream Deck.
     * @returns Settings namespace.
     */
    get settings() {
        return settings;
    },
    /**
     * Namespace for interacting with, and receiving events from, the system the plugin is running on.
     * @returns System namespace.
     */
    get system() {
        return system;
    },
    /**
     * Namespace for interacting with UI (property inspector) associated with the plugin.
     * @returns UI namespace.
     */
    get ui() {
        return ui;
    },
    /**
     * Connects the plugin to the Stream Deck.
     * @returns A promise resolved when a connection has been established.
     */
    connect() {
        return connection.connect();
    },
};

const LAN_PROTOCOL_LABEL = "streamdeck-lan-v1";
const LAN_KEY_BYTES = 32;
const LAN_NONCE_BYTES = 32;
const COMPARISON_KEY = Buffer.from("streamdeck-lan-double-hmac-v1", "utf8");
function bytes(value) {
    return typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
}
function u32be(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new Error("LAN field is too large.");
    const result = Buffer.allocUnsafe(4);
    result.writeUInt32BE(value, 0);
    return result;
}
function u64be(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("LAN sequence is invalid.");
    const result = Buffer.alloc(8);
    result.writeBigUInt64BE(BigInt(value), 0);
    return result;
}
function encodeLanFields(fields) {
    const encoded = [];
    for (const field of fields) {
        const value = bytes(field);
        encoded.push(u32be(value.length), value);
    }
    return Buffer.concat(encoded);
}
function decodeHex(value, expectedBytes) {
    if (typeof value !== "string" || value.length === 0 || value.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(value))
        return undefined;
    const decoded = Buffer.from(value, "hex");
    return decoded.length !== expectedBytes ? undefined : decoded;
}
function encodeHex(value) {
    return Buffer.from(value).toString("hex");
}
function hmacSha256(key, data) {
    return createHmac("sha256", bytes(key)).update(bytes(data)).digest();
}
function doubleHmacEqual(expected, actual) {
    const left = hmacSha256(COMPARISON_KEY, hmacSha256(COMPARISON_KEY, expected));
    const right = hmacSha256(COMPARISON_KEY, hmacSha256(COMPARISON_KEY, actual));
    return left.length === right.length && timingSafeEqual(left, right);
}
function lanTranscript(role, clientId, clientNonce, serverNonce) {
    return encodeLanFields([LAN_PROTOCOL_LABEL, role, clientId, clientNonce, serverNonce]);
}
function lanProof(key, role, clientId, clientNonce, serverNonce) {
    return hmacSha256(key, lanTranscript(role, clientId, clientNonce, serverNonce));
}
function lanKdfSalt(clientId, clientNonce, serverNonce) {
    return encodeLanFields([LAN_PROTOCOL_LABEL, "salt", clientId, clientNonce, serverNonce]);
}
function lanFrameInfo(direction) {
    return encodeLanFields([LAN_PROTOCOL_LABEL, "frame", direction]);
}
function deriveLanFrameKey(key, clientId, clientNonce, serverNonce, direction) {
    const derived = hkdfSync("sha256", bytes(key), lanKdfSalt(clientId, clientNonce, serverNonce), lanFrameInfo(direction), 32);
    return Buffer.from(derived);
}
function lanFrameMac(frameKey, direction, sequence, payload) {
    return hmacSha256(frameKey, encodeLanFields([LAN_PROTOCOL_LABEL, "frame", direction, u64be(sequence), bytes(payload)]));
}
function readLanKey(value) {
    const key = bytes(value);
    if (key.length !== LAN_KEY_BYTES)
        throw new Error("LAN credential must be exactly 32 bytes.");
    return key;
}

var _2020 = {exports: {}};

var core$1 = {};

var validate = {};

var boolSchema = {};

var errors = {};

var codegen = {};

var code$1 = {};

var hasRequiredCode$1;

function requireCode$1 () {
	if (hasRequiredCode$1) return code$1;
	hasRequiredCode$1 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = void 0;
		// eslint-disable-next-line @typescript-eslint/no-extraneous-class
		class _CodeOrName {
		}
		exports._CodeOrName = _CodeOrName;
		exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
		class Name extends _CodeOrName {
		    constructor(s) {
		        super();
		        if (!exports.IDENTIFIER.test(s))
		            throw new Error("CodeGen: name must be a valid identifier");
		        this.str = s;
		    }
		    toString() {
		        return this.str;
		    }
		    emptyStr() {
		        return false;
		    }
		    get names() {
		        return { [this.str]: 1 };
		    }
		}
		exports.Name = Name;
		class _Code extends _CodeOrName {
		    constructor(code) {
		        super();
		        this._items = typeof code === "string" ? [code] : code;
		    }
		    toString() {
		        return this.str;
		    }
		    emptyStr() {
		        if (this._items.length > 1)
		            return false;
		        const item = this._items[0];
		        return item === "" || item === '""';
		    }
		    get str() {
		        var _a;
		        return ((_a = this._str) !== null && _a !== void 0 ? _a : (this._str = this._items.reduce((s, c) => `${s}${c}`, "")));
		    }
		    get names() {
		        var _a;
		        return ((_a = this._names) !== null && _a !== void 0 ? _a : (this._names = this._items.reduce((names, c) => {
		            if (c instanceof Name)
		                names[c.str] = (names[c.str] || 0) + 1;
		            return names;
		        }, {})));
		    }
		}
		exports._Code = _Code;
		exports.nil = new _Code("");
		function _(strs, ...args) {
		    const code = [strs[0]];
		    let i = 0;
		    while (i < args.length) {
		        addCodeArg(code, args[i]);
		        code.push(strs[++i]);
		    }
		    return new _Code(code);
		}
		exports._ = _;
		const plus = new _Code("+");
		function str(strs, ...args) {
		    const expr = [safeStringify(strs[0])];
		    let i = 0;
		    while (i < args.length) {
		        expr.push(plus);
		        addCodeArg(expr, args[i]);
		        expr.push(plus, safeStringify(strs[++i]));
		    }
		    optimize(expr);
		    return new _Code(expr);
		}
		exports.str = str;
		function addCodeArg(code, arg) {
		    if (arg instanceof _Code)
		        code.push(...arg._items);
		    else if (arg instanceof Name)
		        code.push(arg);
		    else
		        code.push(interpolate(arg));
		}
		exports.addCodeArg = addCodeArg;
		function optimize(expr) {
		    let i = 1;
		    while (i < expr.length - 1) {
		        if (expr[i] === plus) {
		            const res = mergeExprItems(expr[i - 1], expr[i + 1]);
		            if (res !== undefined) {
		                expr.splice(i - 1, 3, res);
		                continue;
		            }
		            expr[i++] = "+";
		        }
		        i++;
		    }
		}
		function mergeExprItems(a, b) {
		    if (b === '""')
		        return a;
		    if (a === '""')
		        return b;
		    if (typeof a == "string") {
		        if (b instanceof Name || a[a.length - 1] !== '"')
		            return;
		        if (typeof b != "string")
		            return `${a.slice(0, -1)}${b}"`;
		        if (b[0] === '"')
		            return a.slice(0, -1) + b.slice(1);
		        return;
		    }
		    if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
		        return `"${a}${b.slice(1)}`;
		    return;
		}
		function strConcat(c1, c2) {
		    return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str `${c1}${c2}`;
		}
		exports.strConcat = strConcat;
		// TODO do not allow arrays here
		function interpolate(x) {
		    return typeof x == "number" || typeof x == "boolean" || x === null
		        ? x
		        : safeStringify(Array.isArray(x) ? x.join(",") : x);
		}
		function stringify(x) {
		    return new _Code(safeStringify(x));
		}
		exports.stringify = stringify;
		function safeStringify(x) {
		    return JSON.stringify(x)
		        .replace(/\u2028/g, "\\u2028")
		        .replace(/\u2029/g, "\\u2029");
		}
		exports.safeStringify = safeStringify;
		function getProperty(key) {
		    return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _ `[${key}]`;
		}
		exports.getProperty = getProperty;
		//Does best effort to format the name properly
		function getEsmExportName(key) {
		    if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
		        return new _Code(`${key}`);
		    }
		    throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
		}
		exports.getEsmExportName = getEsmExportName;
		function regexpCode(rx) {
		    return new _Code(rx.toString());
		}
		exports.regexpCode = regexpCode;
		
	} (code$1));
	return code$1;
}

var scope = {};

var hasRequiredScope;

function requireScope () {
	if (hasRequiredScope) return scope;
	hasRequiredScope = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = void 0;
		const code_1 = requireCode$1();
		class ValueError extends Error {
		    constructor(name) {
		        super(`CodeGen: "code" for ${name} not defined`);
		        this.value = name.value;
		    }
		}
		var UsedValueState;
		(function (UsedValueState) {
		    UsedValueState[UsedValueState["Started"] = 0] = "Started";
		    UsedValueState[UsedValueState["Completed"] = 1] = "Completed";
		})(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
		exports.varKinds = {
		    const: new code_1.Name("const"),
		    let: new code_1.Name("let"),
		    var: new code_1.Name("var"),
		};
		class Scope {
		    constructor({ prefixes, parent } = {}) {
		        this._names = {};
		        this._prefixes = prefixes;
		        this._parent = parent;
		    }
		    toName(nameOrPrefix) {
		        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
		    }
		    name(prefix) {
		        return new code_1.Name(this._newName(prefix));
		    }
		    _newName(prefix) {
		        const ng = this._names[prefix] || this._nameGroup(prefix);
		        return `${prefix}${ng.index++}`;
		    }
		    _nameGroup(prefix) {
		        var _a, _b;
		        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || (this._prefixes && !this._prefixes.has(prefix))) {
		            throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
		        }
		        return (this._names[prefix] = { prefix, index: 0 });
		    }
		}
		exports.Scope = Scope;
		class ValueScopeName extends code_1.Name {
		    constructor(prefix, nameStr) {
		        super(nameStr);
		        this.prefix = prefix;
		    }
		    setValue(value, { property, itemIndex }) {
		        this.value = value;
		        this.scopePath = (0, code_1._) `.${new code_1.Name(property)}[${itemIndex}]`;
		    }
		}
		exports.ValueScopeName = ValueScopeName;
		const line = (0, code_1._) `\n`;
		class ValueScope extends Scope {
		    constructor(opts) {
		        super(opts);
		        this._values = {};
		        this._scope = opts.scope;
		        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
		    }
		    get() {
		        return this._scope;
		    }
		    name(prefix) {
		        return new ValueScopeName(prefix, this._newName(prefix));
		    }
		    value(nameOrPrefix, value) {
		        var _a;
		        if (value.ref === undefined)
		            throw new Error("CodeGen: ref must be passed in value");
		        const name = this.toName(nameOrPrefix);
		        const { prefix } = name;
		        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
		        let vs = this._values[prefix];
		        if (vs) {
		            const _name = vs.get(valueKey);
		            if (_name)
		                return _name;
		        }
		        else {
		            vs = this._values[prefix] = new Map();
		        }
		        vs.set(valueKey, name);
		        const s = this._scope[prefix] || (this._scope[prefix] = []);
		        const itemIndex = s.length;
		        s[itemIndex] = value.ref;
		        name.setValue(value, { property: prefix, itemIndex });
		        return name;
		    }
		    getValue(prefix, keyOrRef) {
		        const vs = this._values[prefix];
		        if (!vs)
		            return;
		        return vs.get(keyOrRef);
		    }
		    scopeRefs(scopeName, values = this._values) {
		        return this._reduceValues(values, (name) => {
		            if (name.scopePath === undefined)
		                throw new Error(`CodeGen: name "${name}" has no value`);
		            return (0, code_1._) `${scopeName}${name.scopePath}`;
		        });
		    }
		    scopeCode(values = this._values, usedValues, getCode) {
		        return this._reduceValues(values, (name) => {
		            if (name.value === undefined)
		                throw new Error(`CodeGen: name "${name}" has no value`);
		            return name.value.code;
		        }, usedValues, getCode);
		    }
		    _reduceValues(values, valueCode, usedValues = {}, getCode) {
		        let code = code_1.nil;
		        for (const prefix in values) {
		            const vs = values[prefix];
		            if (!vs)
		                continue;
		            const nameSet = (usedValues[prefix] = usedValues[prefix] || new Map());
		            vs.forEach((name) => {
		                if (nameSet.has(name))
		                    return;
		                nameSet.set(name, UsedValueState.Started);
		                let c = valueCode(name);
		                if (c) {
		                    const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
		                    code = (0, code_1._) `${code}${def} ${name} = ${c};${this.opts._n}`;
		                }
		                else if ((c = getCode === null || getCode === void 0 ? void 0 : getCode(name))) {
		                    code = (0, code_1._) `${code}${c}${this.opts._n}`;
		                }
		                else {
		                    throw new ValueError(name);
		                }
		                nameSet.set(name, UsedValueState.Completed);
		            });
		        }
		        return code;
		    }
		}
		exports.ValueScope = ValueScope;
		
	} (scope));
	return scope;
}

var hasRequiredCodegen;

function requireCodegen () {
	if (hasRequiredCodegen) return codegen;
	hasRequiredCodegen = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = void 0;
		const code_1 = requireCode$1();
		const scope_1 = requireScope();
		var code_2 = requireCode$1();
		Object.defineProperty(exports, "_", { enumerable: true, get: function () { return code_2._; } });
		Object.defineProperty(exports, "str", { enumerable: true, get: function () { return code_2.str; } });
		Object.defineProperty(exports, "strConcat", { enumerable: true, get: function () { return code_2.strConcat; } });
		Object.defineProperty(exports, "nil", { enumerable: true, get: function () { return code_2.nil; } });
		Object.defineProperty(exports, "getProperty", { enumerable: true, get: function () { return code_2.getProperty; } });
		Object.defineProperty(exports, "stringify", { enumerable: true, get: function () { return code_2.stringify; } });
		Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function () { return code_2.regexpCode; } });
		Object.defineProperty(exports, "Name", { enumerable: true, get: function () { return code_2.Name; } });
		var scope_2 = requireScope();
		Object.defineProperty(exports, "Scope", { enumerable: true, get: function () { return scope_2.Scope; } });
		Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function () { return scope_2.ValueScope; } });
		Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function () { return scope_2.ValueScopeName; } });
		Object.defineProperty(exports, "varKinds", { enumerable: true, get: function () { return scope_2.varKinds; } });
		exports.operators = {
		    GT: new code_1._Code(">"),
		    GTE: new code_1._Code(">="),
		    LT: new code_1._Code("<"),
		    LTE: new code_1._Code("<="),
		    EQ: new code_1._Code("==="),
		    NEQ: new code_1._Code("!=="),
		    NOT: new code_1._Code("!"),
		    OR: new code_1._Code("||"),
		    AND: new code_1._Code("&&"),
		    ADD: new code_1._Code("+"),
		};
		class Node {
		    optimizeNodes() {
		        return this;
		    }
		    optimizeNames(_names, _constants) {
		        return this;
		    }
		}
		class Def extends Node {
		    constructor(varKind, name, rhs) {
		        super();
		        this.varKind = varKind;
		        this.name = name;
		        this.rhs = rhs;
		    }
		    render({ es5, _n }) {
		        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
		        const rhs = this.rhs === undefined ? "" : ` = ${this.rhs}`;
		        return `${varKind} ${this.name}${rhs};` + _n;
		    }
		    optimizeNames(names, constants) {
		        if (!names[this.name.str])
		            return;
		        if (this.rhs)
		            this.rhs = optimizeExpr(this.rhs, names, constants);
		        return this;
		    }
		    get names() {
		        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
		    }
		}
		class Assign extends Node {
		    constructor(lhs, rhs, sideEffects) {
		        super();
		        this.lhs = lhs;
		        this.rhs = rhs;
		        this.sideEffects = sideEffects;
		    }
		    render({ _n }) {
		        return `${this.lhs} = ${this.rhs};` + _n;
		    }
		    optimizeNames(names, constants) {
		        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
		            return;
		        this.rhs = optimizeExpr(this.rhs, names, constants);
		        return this;
		    }
		    get names() {
		        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
		        return addExprNames(names, this.rhs);
		    }
		}
		class AssignOp extends Assign {
		    constructor(lhs, op, rhs, sideEffects) {
		        super(lhs, rhs, sideEffects);
		        this.op = op;
		    }
		    render({ _n }) {
		        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
		    }
		}
		class Label extends Node {
		    constructor(label) {
		        super();
		        this.label = label;
		        this.names = {};
		    }
		    render({ _n }) {
		        return `${this.label}:` + _n;
		    }
		}
		class Break extends Node {
		    constructor(label) {
		        super();
		        this.label = label;
		        this.names = {};
		    }
		    render({ _n }) {
		        const label = this.label ? ` ${this.label}` : "";
		        return `break${label};` + _n;
		    }
		}
		class Throw extends Node {
		    constructor(error) {
		        super();
		        this.error = error;
		    }
		    render({ _n }) {
		        return `throw ${this.error};` + _n;
		    }
		    get names() {
		        return this.error.names;
		    }
		}
		class AnyCode extends Node {
		    constructor(code) {
		        super();
		        this.code = code;
		    }
		    render({ _n }) {
		        return `${this.code};` + _n;
		    }
		    optimizeNodes() {
		        return `${this.code}` ? this : undefined;
		    }
		    optimizeNames(names, constants) {
		        this.code = optimizeExpr(this.code, names, constants);
		        return this;
		    }
		    get names() {
		        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
		    }
		}
		class ParentNode extends Node {
		    constructor(nodes = []) {
		        super();
		        this.nodes = nodes;
		    }
		    render(opts) {
		        return this.nodes.reduce((code, n) => code + n.render(opts), "");
		    }
		    optimizeNodes() {
		        const { nodes } = this;
		        let i = nodes.length;
		        while (i--) {
		            const n = nodes[i].optimizeNodes();
		            if (Array.isArray(n))
		                nodes.splice(i, 1, ...n);
		            else if (n)
		                nodes[i] = n;
		            else
		                nodes.splice(i, 1);
		        }
		        return nodes.length > 0 ? this : undefined;
		    }
		    optimizeNames(names, constants) {
		        const { nodes } = this;
		        let i = nodes.length;
		        while (i--) {
		            // iterating backwards improves 1-pass optimization
		            const n = nodes[i];
		            if (n.optimizeNames(names, constants))
		                continue;
		            subtractNames(names, n.names);
		            nodes.splice(i, 1);
		        }
		        return nodes.length > 0 ? this : undefined;
		    }
		    get names() {
		        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
		    }
		}
		class BlockNode extends ParentNode {
		    render(opts) {
		        return "{" + opts._n + super.render(opts) + "}" + opts._n;
		    }
		}
		class Root extends ParentNode {
		}
		class Else extends BlockNode {
		}
		Else.kind = "else";
		class If extends BlockNode {
		    constructor(condition, nodes) {
		        super(nodes);
		        this.condition = condition;
		    }
		    render(opts) {
		        let code = `if(${this.condition})` + super.render(opts);
		        if (this.else)
		            code += "else " + this.else.render(opts);
		        return code;
		    }
		    optimizeNodes() {
		        super.optimizeNodes();
		        const cond = this.condition;
		        if (cond === true)
		            return this.nodes; // else is ignored here
		        let e = this.else;
		        if (e) {
		            const ns = e.optimizeNodes();
		            e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
		        }
		        if (e) {
		            if (cond === false)
		                return e instanceof If ? e : e.nodes;
		            if (this.nodes.length)
		                return this;
		            return new If(not(cond), e instanceof If ? [e] : e.nodes);
		        }
		        if (cond === false || !this.nodes.length)
		            return undefined;
		        return this;
		    }
		    optimizeNames(names, constants) {
		        var _a;
		        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
		        if (!(super.optimizeNames(names, constants) || this.else))
		            return;
		        this.condition = optimizeExpr(this.condition, names, constants);
		        return this;
		    }
		    get names() {
		        const names = super.names;
		        addExprNames(names, this.condition);
		        if (this.else)
		            addNames(names, this.else.names);
		        return names;
		    }
		}
		If.kind = "if";
		class For extends BlockNode {
		}
		For.kind = "for";
		class ForLoop extends For {
		    constructor(iteration) {
		        super();
		        this.iteration = iteration;
		    }
		    render(opts) {
		        return `for(${this.iteration})` + super.render(opts);
		    }
		    optimizeNames(names, constants) {
		        if (!super.optimizeNames(names, constants))
		            return;
		        this.iteration = optimizeExpr(this.iteration, names, constants);
		        return this;
		    }
		    get names() {
		        return addNames(super.names, this.iteration.names);
		    }
		}
		class ForRange extends For {
		    constructor(varKind, name, from, to) {
		        super();
		        this.varKind = varKind;
		        this.name = name;
		        this.from = from;
		        this.to = to;
		    }
		    render(opts) {
		        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
		        const { name, from, to } = this;
		        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
		    }
		    get names() {
		        const names = addExprNames(super.names, this.from);
		        return addExprNames(names, this.to);
		    }
		}
		class ForIter extends For {
		    constructor(loop, varKind, name, iterable) {
		        super();
		        this.loop = loop;
		        this.varKind = varKind;
		        this.name = name;
		        this.iterable = iterable;
		    }
		    render(opts) {
		        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
		    }
		    optimizeNames(names, constants) {
		        if (!super.optimizeNames(names, constants))
		            return;
		        this.iterable = optimizeExpr(this.iterable, names, constants);
		        return this;
		    }
		    get names() {
		        return addNames(super.names, this.iterable.names);
		    }
		}
		class Func extends BlockNode {
		    constructor(name, args, async) {
		        super();
		        this.name = name;
		        this.args = args;
		        this.async = async;
		    }
		    render(opts) {
		        const _async = this.async ? "async " : "";
		        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
		    }
		}
		Func.kind = "func";
		class Return extends ParentNode {
		    render(opts) {
		        return "return " + super.render(opts);
		    }
		}
		Return.kind = "return";
		class Try extends BlockNode {
		    render(opts) {
		        let code = "try" + super.render(opts);
		        if (this.catch)
		            code += this.catch.render(opts);
		        if (this.finally)
		            code += this.finally.render(opts);
		        return code;
		    }
		    optimizeNodes() {
		        var _a, _b;
		        super.optimizeNodes();
		        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
		        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
		        return this;
		    }
		    optimizeNames(names, constants) {
		        var _a, _b;
		        super.optimizeNames(names, constants);
		        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
		        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
		        return this;
		    }
		    get names() {
		        const names = super.names;
		        if (this.catch)
		            addNames(names, this.catch.names);
		        if (this.finally)
		            addNames(names, this.finally.names);
		        return names;
		    }
		}
		class Catch extends BlockNode {
		    constructor(error) {
		        super();
		        this.error = error;
		    }
		    render(opts) {
		        return `catch(${this.error})` + super.render(opts);
		    }
		}
		Catch.kind = "catch";
		class Finally extends BlockNode {
		    render(opts) {
		        return "finally" + super.render(opts);
		    }
		}
		Finally.kind = "finally";
		class CodeGen {
		    constructor(extScope, opts = {}) {
		        this._values = {};
		        this._blockStarts = [];
		        this._constants = {};
		        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
		        this._extScope = extScope;
		        this._scope = new scope_1.Scope({ parent: extScope });
		        this._nodes = [new Root()];
		    }
		    toString() {
		        return this._root.render(this.opts);
		    }
		    // returns unique name in the internal scope
		    name(prefix) {
		        return this._scope.name(prefix);
		    }
		    // reserves unique name in the external scope
		    scopeName(prefix) {
		        return this._extScope.name(prefix);
		    }
		    // reserves unique name in the external scope and assigns value to it
		    scopeValue(prefixOrName, value) {
		        const name = this._extScope.value(prefixOrName, value);
		        const vs = this._values[name.prefix] || (this._values[name.prefix] = new Set());
		        vs.add(name);
		        return name;
		    }
		    getScopeValue(prefix, keyOrRef) {
		        return this._extScope.getValue(prefix, keyOrRef);
		    }
		    // return code that assigns values in the external scope to the names that are used internally
		    // (same names that were returned by gen.scopeName or gen.scopeValue)
		    scopeRefs(scopeName) {
		        return this._extScope.scopeRefs(scopeName, this._values);
		    }
		    scopeCode() {
		        return this._extScope.scopeCode(this._values);
		    }
		    _def(varKind, nameOrPrefix, rhs, constant) {
		        const name = this._scope.toName(nameOrPrefix);
		        if (rhs !== undefined && constant)
		            this._constants[name.str] = rhs;
		        this._leafNode(new Def(varKind, name, rhs));
		        return name;
		    }
		    // `const` declaration (`var` in es5 mode)
		    const(nameOrPrefix, rhs, _constant) {
		        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
		    }
		    // `let` declaration with optional assignment (`var` in es5 mode)
		    let(nameOrPrefix, rhs, _constant) {
		        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
		    }
		    // `var` declaration with optional assignment
		    var(nameOrPrefix, rhs, _constant) {
		        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
		    }
		    // assignment code
		    assign(lhs, rhs, sideEffects) {
		        return this._leafNode(new Assign(lhs, rhs, sideEffects));
		    }
		    // `+=` code
		    add(lhs, rhs) {
		        return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
		    }
		    // appends passed SafeExpr to code or executes Block
		    code(c) {
		        if (typeof c == "function")
		            c();
		        else if (c !== code_1.nil)
		            this._leafNode(new AnyCode(c));
		        return this;
		    }
		    // returns code for object literal for the passed argument list of key-value pairs
		    object(...keyValues) {
		        const code = ["{"];
		        for (const [key, value] of keyValues) {
		            if (code.length > 1)
		                code.push(",");
		            code.push(key);
		            if (key !== value || this.opts.es5) {
		                code.push(":");
		                (0, code_1.addCodeArg)(code, value);
		            }
		        }
		        code.push("}");
		        return new code_1._Code(code);
		    }
		    // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
		    if(condition, thenBody, elseBody) {
		        this._blockNode(new If(condition));
		        if (thenBody && elseBody) {
		            this.code(thenBody).else().code(elseBody).endIf();
		        }
		        else if (thenBody) {
		            this.code(thenBody).endIf();
		        }
		        else if (elseBody) {
		            throw new Error('CodeGen: "else" body without "then" body');
		        }
		        return this;
		    }
		    // `else if` clause - invalid without `if` or after `else` clauses
		    elseIf(condition) {
		        return this._elseNode(new If(condition));
		    }
		    // `else` clause - only valid after `if` or `else if` clauses
		    else() {
		        return this._elseNode(new Else());
		    }
		    // end `if` statement (needed if gen.if was used only with condition)
		    endIf() {
		        return this._endBlockNode(If, Else);
		    }
		    _for(node, forBody) {
		        this._blockNode(node);
		        if (forBody)
		            this.code(forBody).endFor();
		        return this;
		    }
		    // a generic `for` clause (or statement if `forBody` is passed)
		    for(iteration, forBody) {
		        return this._for(new ForLoop(iteration), forBody);
		    }
		    // `for` statement for a range of values
		    forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
		        const name = this._scope.toName(nameOrPrefix);
		        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
		    }
		    // `for-of` statement (in es5 mode replace with a normal for loop)
		    forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
		        const name = this._scope.toName(nameOrPrefix);
		        if (this.opts.es5) {
		            const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
		            return this.forRange("_i", 0, (0, code_1._) `${arr}.length`, (i) => {
		                this.var(name, (0, code_1._) `${arr}[${i}]`);
		                forBody(name);
		            });
		        }
		        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
		    }
		    // `for-in` statement.
		    // With option `ownProperties` replaced with a `for-of` loop for object keys
		    forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
		        if (this.opts.ownProperties) {
		            return this.forOf(nameOrPrefix, (0, code_1._) `Object.keys(${obj})`, forBody);
		        }
		        const name = this._scope.toName(nameOrPrefix);
		        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
		    }
		    // end `for` loop
		    endFor() {
		        return this._endBlockNode(For);
		    }
		    // `label` statement
		    label(label) {
		        return this._leafNode(new Label(label));
		    }
		    // `break` statement
		    break(label) {
		        return this._leafNode(new Break(label));
		    }
		    // `return` statement
		    return(value) {
		        const node = new Return();
		        this._blockNode(node);
		        this.code(value);
		        if (node.nodes.length !== 1)
		            throw new Error('CodeGen: "return" should have one node');
		        return this._endBlockNode(Return);
		    }
		    // `try` statement
		    try(tryBody, catchCode, finallyCode) {
		        if (!catchCode && !finallyCode)
		            throw new Error('CodeGen: "try" without "catch" and "finally"');
		        const node = new Try();
		        this._blockNode(node);
		        this.code(tryBody);
		        if (catchCode) {
		            const error = this.name("e");
		            this._currNode = node.catch = new Catch(error);
		            catchCode(error);
		        }
		        if (finallyCode) {
		            this._currNode = node.finally = new Finally();
		            this.code(finallyCode);
		        }
		        return this._endBlockNode(Catch, Finally);
		    }
		    // `throw` statement
		    throw(error) {
		        return this._leafNode(new Throw(error));
		    }
		    // start self-balancing block
		    block(body, nodeCount) {
		        this._blockStarts.push(this._nodes.length);
		        if (body)
		            this.code(body).endBlock(nodeCount);
		        return this;
		    }
		    // end the current self-balancing block
		    endBlock(nodeCount) {
		        const len = this._blockStarts.pop();
		        if (len === undefined)
		            throw new Error("CodeGen: not in self-balancing block");
		        const toClose = this._nodes.length - len;
		        if (toClose < 0 || (nodeCount !== undefined && toClose !== nodeCount)) {
		            throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
		        }
		        this._nodes.length = len;
		        return this;
		    }
		    // `function` heading (or definition if funcBody is passed)
		    func(name, args = code_1.nil, async, funcBody) {
		        this._blockNode(new Func(name, args, async));
		        if (funcBody)
		            this.code(funcBody).endFunc();
		        return this;
		    }
		    // end function definition
		    endFunc() {
		        return this._endBlockNode(Func);
		    }
		    optimize(n = 1) {
		        while (n-- > 0) {
		            this._root.optimizeNodes();
		            this._root.optimizeNames(this._root.names, this._constants);
		        }
		    }
		    _leafNode(node) {
		        this._currNode.nodes.push(node);
		        return this;
		    }
		    _blockNode(node) {
		        this._currNode.nodes.push(node);
		        this._nodes.push(node);
		    }
		    _endBlockNode(N1, N2) {
		        const n = this._currNode;
		        if (n instanceof N1 || (N2 && n instanceof N2)) {
		            this._nodes.pop();
		            return this;
		        }
		        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
		    }
		    _elseNode(node) {
		        const n = this._currNode;
		        if (!(n instanceof If)) {
		            throw new Error('CodeGen: "else" without "if"');
		        }
		        this._currNode = n.else = node;
		        return this;
		    }
		    get _root() {
		        return this._nodes[0];
		    }
		    get _currNode() {
		        const ns = this._nodes;
		        return ns[ns.length - 1];
		    }
		    set _currNode(node) {
		        const ns = this._nodes;
		        ns[ns.length - 1] = node;
		    }
		}
		exports.CodeGen = CodeGen;
		function addNames(names, from) {
		    for (const n in from)
		        names[n] = (names[n] || 0) + (from[n] || 0);
		    return names;
		}
		function addExprNames(names, from) {
		    return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
		}
		function optimizeExpr(expr, names, constants) {
		    if (expr instanceof code_1.Name)
		        return replaceName(expr);
		    if (!canOptimize(expr))
		        return expr;
		    return new code_1._Code(expr._items.reduce((items, c) => {
		        if (c instanceof code_1.Name)
		            c = replaceName(c);
		        if (c instanceof code_1._Code)
		            items.push(...c._items);
		        else
		            items.push(c);
		        return items;
		    }, []));
		    function replaceName(n) {
		        const c = constants[n.str];
		        if (c === undefined || names[n.str] !== 1)
		            return n;
		        delete names[n.str];
		        return c;
		    }
		    function canOptimize(e) {
		        return (e instanceof code_1._Code &&
		            e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== undefined));
		    }
		}
		function subtractNames(names, from) {
		    for (const n in from)
		        names[n] = (names[n] || 0) - (from[n] || 0);
		}
		function not(x) {
		    return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._) `!${par(x)}`;
		}
		exports.not = not;
		const andCode = mappend(exports.operators.AND);
		// boolean AND (&&) expression with the passed arguments
		function and(...args) {
		    return args.reduce(andCode);
		}
		exports.and = and;
		const orCode = mappend(exports.operators.OR);
		// boolean OR (||) expression with the passed arguments
		function or(...args) {
		    return args.reduce(orCode);
		}
		exports.or = or;
		function mappend(op) {
		    return (x, y) => (x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._) `${par(x)} ${op} ${par(y)}`);
		}
		function par(x) {
		    return x instanceof code_1.Name ? x : (0, code_1._) `(${x})`;
		}
		
	} (codegen));
	return codegen;
}

var util = {};

var hasRequiredUtil;

function requireUtil () {
	if (hasRequiredUtil) return util;
	hasRequiredUtil = 1;
	Object.defineProperty(util, "__esModule", { value: true });
	util.checkStrictMode = util.getErrorPath = util.Type = util.useFunc = util.setEvaluated = util.evaluatedPropsToName = util.mergeEvaluated = util.eachItem = util.unescapeJsonPointer = util.escapeJsonPointer = util.escapeFragment = util.unescapeFragment = util.schemaRefOrVal = util.schemaHasRulesButRef = util.schemaHasRules = util.checkUnknownRules = util.alwaysValidSchema = util.toHash = void 0;
	const codegen_1 = requireCodegen();
	const code_1 = requireCode$1();
	// TODO refactor to use Set
	function toHash(arr) {
	    const hash = {};
	    for (const item of arr)
	        hash[item] = true;
	    return hash;
	}
	util.toHash = toHash;
	function alwaysValidSchema(it, schema) {
	    if (typeof schema == "boolean")
	        return schema;
	    if (Object.keys(schema).length === 0)
	        return true;
	    checkUnknownRules(it, schema);
	    return !schemaHasRules(schema, it.self.RULES.all);
	}
	util.alwaysValidSchema = alwaysValidSchema;
	function checkUnknownRules(it, schema = it.schema) {
	    const { opts, self } = it;
	    if (!opts.strictSchema)
	        return;
	    if (typeof schema === "boolean")
	        return;
	    const rules = self.RULES.keywords;
	    for (const key in schema) {
	        if (!rules[key])
	            checkStrictMode(it, `unknown keyword: "${key}"`);
	    }
	}
	util.checkUnknownRules = checkUnknownRules;
	function schemaHasRules(schema, rules) {
	    if (typeof schema == "boolean")
	        return !schema;
	    for (const key in schema)
	        if (rules[key])
	            return true;
	    return false;
	}
	util.schemaHasRules = schemaHasRules;
	function schemaHasRulesButRef(schema, RULES) {
	    if (typeof schema == "boolean")
	        return !schema;
	    for (const key in schema)
	        if (key !== "$ref" && RULES.all[key])
	            return true;
	    return false;
	}
	util.schemaHasRulesButRef = schemaHasRulesButRef;
	function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
	    if (!$data) {
	        if (typeof schema == "number" || typeof schema == "boolean")
	            return schema;
	        if (typeof schema == "string")
	            return (0, codegen_1._) `${schema}`;
	    }
	    return (0, codegen_1._) `${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
	}
	util.schemaRefOrVal = schemaRefOrVal;
	function unescapeFragment(str) {
	    return unescapeJsonPointer(decodeURIComponent(str));
	}
	util.unescapeFragment = unescapeFragment;
	function escapeFragment(str) {
	    return encodeURIComponent(escapeJsonPointer(str));
	}
	util.escapeFragment = escapeFragment;
	function escapeJsonPointer(str) {
	    if (typeof str == "number")
	        return `${str}`;
	    return str.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	util.escapeJsonPointer = escapeJsonPointer;
	function unescapeJsonPointer(str) {
	    return str.replace(/~1/g, "/").replace(/~0/g, "~");
	}
	util.unescapeJsonPointer = unescapeJsonPointer;
	function eachItem(xs, f) {
	    if (Array.isArray(xs)) {
	        for (const x of xs)
	            f(x);
	    }
	    else {
	        f(xs);
	    }
	}
	util.eachItem = eachItem;
	function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName, }) {
	    return (gen, from, to, toName) => {
	        const res = to === undefined
	            ? from
	            : to instanceof codegen_1.Name
	                ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to)
	                : from instanceof codegen_1.Name
	                    ? (mergeToName(gen, to, from), from)
	                    : mergeValues(from, to);
	        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
	    };
	}
	util.mergeEvaluated = {
	    props: makeMergeEvaluated({
	        mergeNames: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true && ${from} !== undefined`, () => {
	            gen.if((0, codegen_1._) `${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._) `${to} || {}`).code((0, codegen_1._) `Object.assign(${to}, ${from})`));
	        }),
	        mergeToName: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true`, () => {
	            if (from === true) {
	                gen.assign(to, true);
	            }
	            else {
	                gen.assign(to, (0, codegen_1._) `${to} || {}`);
	                setEvaluated(gen, to, from);
	            }
	        }),
	        mergeValues: (from, to) => (from === true ? true : { ...from, ...to }),
	        resultToName: evaluatedPropsToName,
	    }),
	    items: makeMergeEvaluated({
	        mergeNames: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._) `${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
	        mergeToName: (gen, from, to) => gen.if((0, codegen_1._) `${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._) `${to} > ${from} ? ${to} : ${from}`)),
	        mergeValues: (from, to) => (from === true ? true : Math.max(from, to)),
	        resultToName: (gen, items) => gen.var("items", items),
	    }),
	};
	function evaluatedPropsToName(gen, ps) {
	    if (ps === true)
	        return gen.var("props", true);
	    const props = gen.var("props", (0, codegen_1._) `{}`);
	    if (ps !== undefined)
	        setEvaluated(gen, props, ps);
	    return props;
	}
	util.evaluatedPropsToName = evaluatedPropsToName;
	function setEvaluated(gen, props, ps) {
	    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._) `${props}${(0, codegen_1.getProperty)(p)}`, true));
	}
	util.setEvaluated = setEvaluated;
	const snippets = {};
	function useFunc(gen, f) {
	    return gen.scopeValue("func", {
	        ref: f,
	        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code)),
	    });
	}
	util.useFunc = useFunc;
	var Type;
	(function (Type) {
	    Type[Type["Num"] = 0] = "Num";
	    Type[Type["Str"] = 1] = "Str";
	})(Type || (util.Type = Type = {}));
	function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
	    // let path
	    if (dataProp instanceof codegen_1.Name) {
	        const isNumber = dataPropType === Type.Num;
	        return jsPropertySyntax
	            ? isNumber
	                ? (0, codegen_1._) `"[" + ${dataProp} + "]"`
	                : (0, codegen_1._) `"['" + ${dataProp} + "']"`
	            : isNumber
	                ? (0, codegen_1._) `"/" + ${dataProp}`
	                : (0, codegen_1._) `"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`; // TODO maybe use global escapePointer
	    }
	    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
	}
	util.getErrorPath = getErrorPath;
	function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
	    if (!mode)
	        return;
	    msg = `strict mode: ${msg}`;
	    if (mode === true)
	        throw new Error(msg);
	    it.self.logger.warn(msg);
	}
	util.checkStrictMode = checkStrictMode;
	
	return util;
}

var names = {};

var hasRequiredNames;

function requireNames () {
	if (hasRequiredNames) return names;
	hasRequiredNames = 1;
	Object.defineProperty(names, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const names$1 = {
	    // validation function arguments
	    data: new codegen_1.Name("data"), // data passed to validation function
	    // args passed from referencing schema
	    valCxt: new codegen_1.Name("valCxt"), // validation/data context - should not be used directly, it is destructured to the names below
	    instancePath: new codegen_1.Name("instancePath"),
	    parentData: new codegen_1.Name("parentData"),
	    parentDataProperty: new codegen_1.Name("parentDataProperty"),
	    rootData: new codegen_1.Name("rootData"), // root data - same as the data passed to the first/top validation function
	    dynamicAnchors: new codegen_1.Name("dynamicAnchors"), // used to support recursiveRef and dynamicRef
	    // function scoped variables
	    vErrors: new codegen_1.Name("vErrors"), // null or array of validation errors
	    errors: new codegen_1.Name("errors"), // counter of validation errors
	    this: new codegen_1.Name("this"),
	    // "globals"
	    self: new codegen_1.Name("self"),
	    scope: new codegen_1.Name("scope"),
	    // JTD serialize/parse name for JSON string and position
	    json: new codegen_1.Name("json"),
	    jsonPos: new codegen_1.Name("jsonPos"),
	    jsonLen: new codegen_1.Name("jsonLen"),
	    jsonPart: new codegen_1.Name("jsonPart"),
	};
	names.default = names$1;
	
	return names;
}

var hasRequiredErrors;

function requireErrors () {
	if (hasRequiredErrors) return errors;
	hasRequiredErrors = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = void 0;
		const codegen_1 = requireCodegen();
		const util_1 = requireUtil();
		const names_1 = requireNames();
		exports.keywordError = {
		    message: ({ keyword }) => (0, codegen_1.str) `must pass "${keyword}" keyword validation`,
		};
		exports.keyword$DataError = {
		    message: ({ keyword, schemaType }) => schemaType
		        ? (0, codegen_1.str) `"${keyword}" keyword must be ${schemaType} ($data)`
		        : (0, codegen_1.str) `"${keyword}" keyword is invalid ($data)`,
		};
		function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
		    const { it } = cxt;
		    const { gen, compositeRule, allErrors } = it;
		    const errObj = errorObjectCode(cxt, error, errorPaths);
		    if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : (compositeRule || allErrors)) {
		        addError(gen, errObj);
		    }
		    else {
		        returnErrors(it, (0, codegen_1._) `[${errObj}]`);
		    }
		}
		exports.reportError = reportError;
		function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
		    const { it } = cxt;
		    const { gen, compositeRule, allErrors } = it;
		    const errObj = errorObjectCode(cxt, error, errorPaths);
		    addError(gen, errObj);
		    if (!(compositeRule || allErrors)) {
		        returnErrors(it, names_1.default.vErrors);
		    }
		}
		exports.reportExtraError = reportExtraError;
		function resetErrorsCount(gen, errsCount) {
		    gen.assign(names_1.default.errors, errsCount);
		    gen.if((0, codegen_1._) `${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._) `${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
		}
		exports.resetErrorsCount = resetErrorsCount;
		function extendErrors({ gen, keyword, schemaValue, data, errsCount, it, }) {
		    /* istanbul ignore if */
		    if (errsCount === undefined)
		        throw new Error("ajv implementation error");
		    const err = gen.name("err");
		    gen.forRange("i", errsCount, names_1.default.errors, (i) => {
		        gen.const(err, (0, codegen_1._) `${names_1.default.vErrors}[${i}]`);
		        gen.if((0, codegen_1._) `${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._) `${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
		        gen.assign((0, codegen_1._) `${err}.schemaPath`, (0, codegen_1.str) `${it.errSchemaPath}/${keyword}`);
		        if (it.opts.verbose) {
		            gen.assign((0, codegen_1._) `${err}.schema`, schemaValue);
		            gen.assign((0, codegen_1._) `${err}.data`, data);
		        }
		    });
		}
		exports.extendErrors = extendErrors;
		function addError(gen, errObj) {
		    const err = gen.const("err", errObj);
		    gen.if((0, codegen_1._) `${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._) `[${err}]`), (0, codegen_1._) `${names_1.default.vErrors}.push(${err})`);
		    gen.code((0, codegen_1._) `${names_1.default.errors}++`);
		}
		function returnErrors(it, errs) {
		    const { gen, validateName, schemaEnv } = it;
		    if (schemaEnv.$async) {
		        gen.throw((0, codegen_1._) `new ${it.ValidationError}(${errs})`);
		    }
		    else {
		        gen.assign((0, codegen_1._) `${validateName}.errors`, errs);
		        gen.return(false);
		    }
		}
		const E = {
		    keyword: new codegen_1.Name("keyword"),
		    schemaPath: new codegen_1.Name("schemaPath"), // also used in JTD errors
		    params: new codegen_1.Name("params"),
		    propertyName: new codegen_1.Name("propertyName"),
		    message: new codegen_1.Name("message"),
		    schema: new codegen_1.Name("schema"),
		    parentSchema: new codegen_1.Name("parentSchema"),
		};
		function errorObjectCode(cxt, error, errorPaths) {
		    const { createErrors } = cxt.it;
		    if (createErrors === false)
		        return (0, codegen_1._) `{}`;
		    return errorObject(cxt, error, errorPaths);
		}
		function errorObject(cxt, error, errorPaths = {}) {
		    const { gen, it } = cxt;
		    const keyValues = [
		        errorInstancePath(it, errorPaths),
		        errorSchemaPath(cxt, errorPaths),
		    ];
		    extraErrorProps(cxt, error, keyValues);
		    return gen.object(...keyValues);
		}
		function errorInstancePath({ errorPath }, { instancePath }) {
		    const instPath = instancePath
		        ? (0, codegen_1.str) `${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}`
		        : errorPath;
		    return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
		}
		function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
		    let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str) `${errSchemaPath}/${keyword}`;
		    if (schemaPath) {
		        schPath = (0, codegen_1.str) `${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
		    }
		    return [E.schemaPath, schPath];
		}
		function extraErrorProps(cxt, { params, message }, keyValues) {
		    const { keyword, data, schemaValue, it } = cxt;
		    const { opts, propertyName, topSchemaRef, schemaPath } = it;
		    keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._) `{}`]);
		    if (opts.messages) {
		        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
		    }
		    if (opts.verbose) {
		        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._) `${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
		    }
		    if (propertyName)
		        keyValues.push([E.propertyName, propertyName]);
		}
		
	} (errors));
	return errors;
}

var hasRequiredBoolSchema;

function requireBoolSchema () {
	if (hasRequiredBoolSchema) return boolSchema;
	hasRequiredBoolSchema = 1;
	Object.defineProperty(boolSchema, "__esModule", { value: true });
	boolSchema.boolOrEmptySchema = boolSchema.topBoolOrEmptySchema = void 0;
	const errors_1 = requireErrors();
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const boolError = {
	    message: "boolean schema is false",
	};
	function topBoolOrEmptySchema(it) {
	    const { gen, schema, validateName } = it;
	    if (schema === false) {
	        falseSchemaError(it, false);
	    }
	    else if (typeof schema == "object" && schema.$async === true) {
	        gen.return(names_1.default.data);
	    }
	    else {
	        gen.assign((0, codegen_1._) `${validateName}.errors`, null);
	        gen.return(true);
	    }
	}
	boolSchema.topBoolOrEmptySchema = topBoolOrEmptySchema;
	function boolOrEmptySchema(it, valid) {
	    const { gen, schema } = it;
	    if (schema === false) {
	        gen.var(valid, false); // TODO var
	        falseSchemaError(it);
	    }
	    else {
	        gen.var(valid, true); // TODO var
	    }
	}
	boolSchema.boolOrEmptySchema = boolOrEmptySchema;
	function falseSchemaError(it, overrideAllErrors) {
	    const { gen, data } = it;
	    // TODO maybe some other interface should be used for non-keyword validation errors...
	    const cxt = {
	        gen,
	        keyword: "false schema",
	        data,
	        schema: false,
	        schemaCode: false,
	        schemaValue: false,
	        params: {},
	        it,
	    };
	    (0, errors_1.reportError)(cxt, boolError, undefined, overrideAllErrors);
	}
	
	return boolSchema;
}

var dataType = {};

var rules = {};

var hasRequiredRules;

function requireRules () {
	if (hasRequiredRules) return rules;
	hasRequiredRules = 1;
	Object.defineProperty(rules, "__esModule", { value: true });
	rules.getRules = rules.isJSONType = void 0;
	const _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
	const jsonTypes = new Set(_jsonTypes);
	function isJSONType(x) {
	    return typeof x == "string" && jsonTypes.has(x);
	}
	rules.isJSONType = isJSONType;
	function getRules() {
	    const groups = {
	        number: { type: "number", rules: [] },
	        string: { type: "string", rules: [] },
	        array: { type: "array", rules: [] },
	        object: { type: "object", rules: [] },
	    };
	    return {
	        types: { ...groups, integer: true, boolean: true, null: true },
	        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
	        post: { rules: [] },
	        all: {},
	        keywords: {},
	    };
	}
	rules.getRules = getRules;
	
	return rules;
}

var applicability = {};

var hasRequiredApplicability;

function requireApplicability () {
	if (hasRequiredApplicability) return applicability;
	hasRequiredApplicability = 1;
	Object.defineProperty(applicability, "__esModule", { value: true });
	applicability.shouldUseRule = applicability.shouldUseGroup = applicability.schemaHasRulesForType = void 0;
	function schemaHasRulesForType({ schema, self }, type) {
	    const group = self.RULES.types[type];
	    return group && group !== true && shouldUseGroup(schema, group);
	}
	applicability.schemaHasRulesForType = schemaHasRulesForType;
	function shouldUseGroup(schema, group) {
	    return group.rules.some((rule) => shouldUseRule(schema, rule));
	}
	applicability.shouldUseGroup = shouldUseGroup;
	function shouldUseRule(schema, rule) {
	    var _a;
	    return (schema[rule.keyword] !== undefined ||
	        ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema[kwd] !== undefined)));
	}
	applicability.shouldUseRule = shouldUseRule;
	
	return applicability;
}

var hasRequiredDataType;

function requireDataType () {
	if (hasRequiredDataType) return dataType;
	hasRequiredDataType = 1;
	Object.defineProperty(dataType, "__esModule", { value: true });
	dataType.reportTypeError = dataType.checkDataTypes = dataType.checkDataType = dataType.coerceAndCheckDataType = dataType.getJSONTypes = dataType.getSchemaTypes = dataType.DataType = void 0;
	const rules_1 = requireRules();
	const applicability_1 = requireApplicability();
	const errors_1 = requireErrors();
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	var DataType;
	(function (DataType) {
	    DataType[DataType["Correct"] = 0] = "Correct";
	    DataType[DataType["Wrong"] = 1] = "Wrong";
	})(DataType || (dataType.DataType = DataType = {}));
	function getSchemaTypes(schema) {
	    const types = getJSONTypes(schema.type);
	    const hasNull = types.includes("null");
	    if (hasNull) {
	        if (schema.nullable === false)
	            throw new Error("type: null contradicts nullable: false");
	    }
	    else {
	        if (!types.length && schema.nullable !== undefined) {
	            throw new Error('"nullable" cannot be used without "type"');
	        }
	        if (schema.nullable === true)
	            types.push("null");
	    }
	    return types;
	}
	dataType.getSchemaTypes = getSchemaTypes;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	function getJSONTypes(ts) {
	    const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
	    if (types.every(rules_1.isJSONType))
	        return types;
	    throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
	}
	dataType.getJSONTypes = getJSONTypes;
	function coerceAndCheckDataType(it, types) {
	    const { gen, data, opts } = it;
	    const coerceTo = coerceToTypes(types, opts.coerceTypes);
	    const checkTypes = types.length > 0 &&
	        !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
	    if (checkTypes) {
	        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
	        gen.if(wrongType, () => {
	            if (coerceTo.length)
	                coerceData(it, types, coerceTo);
	            else
	                reportTypeError(it);
	        });
	    }
	    return checkTypes;
	}
	dataType.coerceAndCheckDataType = coerceAndCheckDataType;
	const COERCIBLE = new Set(["string", "number", "integer", "boolean", "null"]);
	function coerceToTypes(types, coerceTypes) {
	    return coerceTypes
	        ? types.filter((t) => COERCIBLE.has(t) || (coerceTypes === "array" && t === "array"))
	        : [];
	}
	function coerceData(it, types, coerceTo) {
	    const { gen, data, opts } = it;
	    const dataType = gen.let("dataType", (0, codegen_1._) `typeof ${data}`);
	    const coerced = gen.let("coerced", (0, codegen_1._) `undefined`);
	    if (opts.coerceTypes === "array") {
	        gen.if((0, codegen_1._) `${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen
	            .assign(data, (0, codegen_1._) `${data}[0]`)
	            .assign(dataType, (0, codegen_1._) `typeof ${data}`)
	            .if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
	    }
	    gen.if((0, codegen_1._) `${coerced} !== undefined`);
	    for (const t of coerceTo) {
	        if (COERCIBLE.has(t) || (t === "array" && opts.coerceTypes === "array")) {
	            coerceSpecificType(t);
	        }
	    }
	    gen.else();
	    reportTypeError(it);
	    gen.endIf();
	    gen.if((0, codegen_1._) `${coerced} !== undefined`, () => {
	        gen.assign(data, coerced);
	        assignParentData(it, coerced);
	    });
	    function coerceSpecificType(t) {
	        switch (t) {
	            case "string":
	                gen
	                    .elseIf((0, codegen_1._) `${dataType} == "number" || ${dataType} == "boolean"`)
	                    .assign(coerced, (0, codegen_1._) `"" + ${data}`)
	                    .elseIf((0, codegen_1._) `${data} === null`)
	                    .assign(coerced, (0, codegen_1._) `""`);
	                return;
	            case "number":
	                gen
	                    .elseIf((0, codegen_1._) `${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`)
	                    .assign(coerced, (0, codegen_1._) `+${data}`);
	                return;
	            case "integer":
	                gen
	                    .elseIf((0, codegen_1._) `${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`)
	                    .assign(coerced, (0, codegen_1._) `+${data}`);
	                return;
	            case "boolean":
	                gen
	                    .elseIf((0, codegen_1._) `${data} === "false" || ${data} === 0 || ${data} === null`)
	                    .assign(coerced, false)
	                    .elseIf((0, codegen_1._) `${data} === "true" || ${data} === 1`)
	                    .assign(coerced, true);
	                return;
	            case "null":
	                gen.elseIf((0, codegen_1._) `${data} === "" || ${data} === 0 || ${data} === false`);
	                gen.assign(coerced, null);
	                return;
	            case "array":
	                gen
	                    .elseIf((0, codegen_1._) `${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`)
	                    .assign(coerced, (0, codegen_1._) `[${data}]`);
	        }
	    }
	}
	function assignParentData({ gen, parentData, parentDataProperty }, expr) {
	    // TODO use gen.property
	    gen.if((0, codegen_1._) `${parentData} !== undefined`, () => gen.assign((0, codegen_1._) `${parentData}[${parentDataProperty}]`, expr));
	}
	function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
	    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
	    let cond;
	    switch (dataType) {
	        case "null":
	            return (0, codegen_1._) `${data} ${EQ} null`;
	        case "array":
	            cond = (0, codegen_1._) `Array.isArray(${data})`;
	            break;
	        case "object":
	            cond = (0, codegen_1._) `${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
	            break;
	        case "integer":
	            cond = numCond((0, codegen_1._) `!(${data} % 1) && !isNaN(${data})`);
	            break;
	        case "number":
	            cond = numCond();
	            break;
	        default:
	            return (0, codegen_1._) `typeof ${data} ${EQ} ${dataType}`;
	    }
	    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
	    function numCond(_cond = codegen_1.nil) {
	        return (0, codegen_1.and)((0, codegen_1._) `typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._) `isFinite(${data})` : codegen_1.nil);
	    }
	}
	dataType.checkDataType = checkDataType;
	function checkDataTypes(dataTypes, data, strictNums, correct) {
	    if (dataTypes.length === 1) {
	        return checkDataType(dataTypes[0], data, strictNums, correct);
	    }
	    let cond;
	    const types = (0, util_1.toHash)(dataTypes);
	    if (types.array && types.object) {
	        const notObj = (0, codegen_1._) `typeof ${data} != "object"`;
	        cond = types.null ? notObj : (0, codegen_1._) `!${data} || ${notObj}`;
	        delete types.null;
	        delete types.array;
	        delete types.object;
	    }
	    else {
	        cond = codegen_1.nil;
	    }
	    if (types.number)
	        delete types.integer;
	    for (const t in types)
	        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
	    return cond;
	}
	dataType.checkDataTypes = checkDataTypes;
	const typeError = {
	    message: ({ schema }) => `must be ${schema}`,
	    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._) `{type: ${schema}}` : (0, codegen_1._) `{type: ${schemaValue}}`,
	};
	function reportTypeError(it) {
	    const cxt = getTypeErrorContext(it);
	    (0, errors_1.reportError)(cxt, typeError);
	}
	dataType.reportTypeError = reportTypeError;
	function getTypeErrorContext(it) {
	    const { gen, data, schema } = it;
	    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
	    return {
	        gen,
	        keyword: "type",
	        data,
	        schema: schema.type,
	        schemaCode,
	        schemaValue: schemaCode,
	        parentSchema: schema,
	        params: {},
	        it,
	    };
	}
	
	return dataType;
}

var defaults = {};

var hasRequiredDefaults;

function requireDefaults () {
	if (hasRequiredDefaults) return defaults;
	hasRequiredDefaults = 1;
	Object.defineProperty(defaults, "__esModule", { value: true });
	defaults.assignDefaults = void 0;
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	function assignDefaults(it, ty) {
	    const { properties, items } = it.schema;
	    if (ty === "object" && properties) {
	        for (const key in properties) {
	            assignDefault(it, key, properties[key].default);
	        }
	    }
	    else if (ty === "array" && Array.isArray(items)) {
	        items.forEach((sch, i) => assignDefault(it, i, sch.default));
	    }
	}
	defaults.assignDefaults = assignDefaults;
	function assignDefault(it, prop, defaultValue) {
	    const { gen, compositeRule, data, opts } = it;
	    if (defaultValue === undefined)
	        return;
	    const childData = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(prop)}`;
	    if (compositeRule) {
	        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
	        return;
	    }
	    let condition = (0, codegen_1._) `${childData} === undefined`;
	    if (opts.useDefaults === "empty") {
	        condition = (0, codegen_1._) `${condition} || ${childData} === null || ${childData} === ""`;
	    }
	    // `${childData} === undefined` +
	    // (opts.useDefaults === "empty" ? ` || ${childData} === null || ${childData} === ""` : "")
	    gen.if(condition, (0, codegen_1._) `${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
	}
	
	return defaults;
}

var keyword = {};

var code = {};

var hasRequiredCode;

function requireCode () {
	if (hasRequiredCode) return code;
	hasRequiredCode = 1;
	Object.defineProperty(code, "__esModule", { value: true });
	code.validateUnion = code.validateArray = code.usePattern = code.callValidateCode = code.schemaProperties = code.allSchemaProperties = code.noPropertyInData = code.propertyInData = code.isOwnProperty = code.hasPropFunc = code.reportMissingProp = code.checkMissingProp = code.checkReportMissingProp = void 0;
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const names_1 = requireNames();
	const util_2 = requireUtil();
	function checkReportMissingProp(cxt, prop) {
	    const { gen, data, it } = cxt;
	    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
	        cxt.setParams({ missingProperty: (0, codegen_1._) `${prop}` }, true);
	        cxt.error();
	    });
	}
	code.checkReportMissingProp = checkReportMissingProp;
	function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
	    return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._) `${missing} = ${prop}`)));
	}
	code.checkMissingProp = checkMissingProp;
	function reportMissingProp(cxt, missing) {
	    cxt.setParams({ missingProperty: missing }, true);
	    cxt.error();
	}
	code.reportMissingProp = reportMissingProp;
	function hasPropFunc(gen) {
	    return gen.scopeValue("func", {
	        // eslint-disable-next-line @typescript-eslint/unbound-method
	        ref: Object.prototype.hasOwnProperty,
	        code: (0, codegen_1._) `Object.prototype.hasOwnProperty`,
	    });
	}
	code.hasPropFunc = hasPropFunc;
	function isOwnProperty(gen, data, property) {
	    return (0, codegen_1._) `${hasPropFunc(gen)}.call(${data}, ${property})`;
	}
	code.isOwnProperty = isOwnProperty;
	function propertyInData(gen, data, property, ownProperties) {
	    const cond = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
	    return ownProperties ? (0, codegen_1._) `${cond} && ${isOwnProperty(gen, data, property)}` : cond;
	}
	code.propertyInData = propertyInData;
	function noPropertyInData(gen, data, property, ownProperties) {
	    const cond = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(property)} === undefined`;
	    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
	}
	code.noPropertyInData = noPropertyInData;
	function allSchemaProperties(schemaMap) {
	    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
	}
	code.allSchemaProperties = allSchemaProperties;
	function schemaProperties(it, schemaMap) {
	    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
	}
	code.schemaProperties = schemaProperties;
	function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
	    const dataAndSchema = passSchema ? (0, codegen_1._) `${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
	    const valCxt = [
	        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
	        [names_1.default.parentData, it.parentData],
	        [names_1.default.parentDataProperty, it.parentDataProperty],
	        [names_1.default.rootData, names_1.default.rootData],
	    ];
	    if (it.opts.dynamicRef)
	        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
	    const args = (0, codegen_1._) `${dataAndSchema}, ${gen.object(...valCxt)}`;
	    return context !== codegen_1.nil ? (0, codegen_1._) `${func}.call(${context}, ${args})` : (0, codegen_1._) `${func}(${args})`;
	}
	code.callValidateCode = callValidateCode;
	const newRegExp = (0, codegen_1._) `new RegExp`;
	function usePattern({ gen, it: { opts } }, pattern) {
	    const u = opts.unicodeRegExp ? "u" : "";
	    const { regExp } = opts.code;
	    const rx = regExp(pattern, u);
	    return gen.scopeValue("pattern", {
	        key: rx.toString(),
	        ref: rx,
	        code: (0, codegen_1._) `${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`,
	    });
	}
	code.usePattern = usePattern;
	function validateArray(cxt) {
	    const { gen, data, keyword, it } = cxt;
	    const valid = gen.name("valid");
	    if (it.allErrors) {
	        const validArr = gen.let("valid", true);
	        validateItems(() => gen.assign(validArr, false));
	        return validArr;
	    }
	    gen.var(valid, true);
	    validateItems(() => gen.break());
	    return valid;
	    function validateItems(notValid) {
	        const len = gen.const("len", (0, codegen_1._) `${data}.length`);
	        gen.forRange("i", 0, len, (i) => {
	            cxt.subschema({
	                keyword,
	                dataProp: i,
	                dataPropType: util_1.Type.Num,
	            }, valid);
	            gen.if((0, codegen_1.not)(valid), notValid);
	        });
	    }
	}
	code.validateArray = validateArray;
	function validateUnion(cxt) {
	    const { gen, schema, keyword, it } = cxt;
	    /* istanbul ignore if */
	    if (!Array.isArray(schema))
	        throw new Error("ajv implementation error");
	    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
	    if (alwaysValid && !it.opts.unevaluated)
	        return;
	    const valid = gen.let("valid", false);
	    const schValid = gen.name("_valid");
	    gen.block(() => schema.forEach((_sch, i) => {
	        const schCxt = cxt.subschema({
	            keyword,
	            schemaProp: i,
	            compositeRule: true,
	        }, schValid);
	        gen.assign(valid, (0, codegen_1._) `${valid} || ${schValid}`);
	        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
	        // can short-circuit if `unevaluatedProperties/Items` not supported (opts.unevaluated !== true)
	        // or if all properties and items were evaluated (it.props === true && it.items === true)
	        if (!merged)
	            gen.if((0, codegen_1.not)(valid));
	    }));
	    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
	}
	code.validateUnion = validateUnion;
	
	return code;
}

var hasRequiredKeyword;

function requireKeyword () {
	if (hasRequiredKeyword) return keyword;
	hasRequiredKeyword = 1;
	Object.defineProperty(keyword, "__esModule", { value: true });
	keyword.validateKeywordUsage = keyword.validSchemaType = keyword.funcKeywordCode = keyword.macroKeywordCode = void 0;
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const code_1 = requireCode();
	const errors_1 = requireErrors();
	function macroKeywordCode(cxt, def) {
	    const { gen, keyword, schema, parentSchema, it } = cxt;
	    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
	    const schemaRef = useKeyword(gen, keyword, macroSchema);
	    if (it.opts.validateSchema !== false)
	        it.self.validateSchema(macroSchema, true);
	    const valid = gen.name("valid");
	    cxt.subschema({
	        schema: macroSchema,
	        schemaPath: codegen_1.nil,
	        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
	        topSchemaRef: schemaRef,
	        compositeRule: true,
	    }, valid);
	    cxt.pass(valid, () => cxt.error(true));
	}
	keyword.macroKeywordCode = macroKeywordCode;
	function funcKeywordCode(cxt, def) {
	    var _a;
	    const { gen, keyword, schema, parentSchema, $data, it } = cxt;
	    checkAsyncKeyword(it, def);
	    const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
	    const validateRef = useKeyword(gen, keyword, validate);
	    const valid = gen.let("valid");
	    cxt.block$data(valid, validateKeyword);
	    cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
	    function validateKeyword() {
	        if (def.errors === false) {
	            assignValid();
	            if (def.modifying)
	                modifyData(cxt);
	            reportErrs(() => cxt.error());
	        }
	        else {
	            const ruleErrs = def.async ? validateAsync() : validateSync();
	            if (def.modifying)
	                modifyData(cxt);
	            reportErrs(() => addErrs(cxt, ruleErrs));
	        }
	    }
	    function validateAsync() {
	        const ruleErrs = gen.let("ruleErrs", null);
	        gen.try(() => assignValid((0, codegen_1._) `await `), (e) => gen.assign(valid, false).if((0, codegen_1._) `${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._) `${e}.errors`), () => gen.throw(e)));
	        return ruleErrs;
	    }
	    function validateSync() {
	        const validateErrs = (0, codegen_1._) `${validateRef}.errors`;
	        gen.assign(validateErrs, null);
	        assignValid(codegen_1.nil);
	        return validateErrs;
	    }
	    function assignValid(_await = def.async ? (0, codegen_1._) `await ` : codegen_1.nil) {
	        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
	        const passSchema = !(("compile" in def && !$data) || def.schema === false);
	        gen.assign(valid, (0, codegen_1._) `${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
	    }
	    function reportErrs(errors) {
	        var _a;
	        gen.if((0, codegen_1.not)((_a = def.valid) !== null && _a !== void 0 ? _a : valid), errors);
	    }
	}
	keyword.funcKeywordCode = funcKeywordCode;
	function modifyData(cxt) {
	    const { gen, data, it } = cxt;
	    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._) `${it.parentData}[${it.parentDataProperty}]`));
	}
	function addErrs(cxt, errs) {
	    const { gen } = cxt;
	    gen.if((0, codegen_1._) `Array.isArray(${errs})`, () => {
	        gen
	            .assign(names_1.default.vErrors, (0, codegen_1._) `${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`)
	            .assign(names_1.default.errors, (0, codegen_1._) `${names_1.default.vErrors}.length`);
	        (0, errors_1.extendErrors)(cxt);
	    }, () => cxt.error());
	}
	function checkAsyncKeyword({ schemaEnv }, def) {
	    if (def.async && !schemaEnv.$async)
	        throw new Error("async keyword in sync schema");
	}
	function useKeyword(gen, keyword, result) {
	    if (result === undefined)
	        throw new Error(`keyword "${keyword}" failed to compile`);
	    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
	}
	function validSchemaType(schema, schemaType, allowUndefined = false) {
	    // TODO add tests
	    return (!schemaType.length ||
	        schemaType.some((st) => st === "array"
	            ? Array.isArray(schema)
	            : st === "object"
	                ? schema && typeof schema == "object" && !Array.isArray(schema)
	                : typeof schema == st || (allowUndefined && typeof schema == "undefined")));
	}
	keyword.validSchemaType = validSchemaType;
	function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
	    /* istanbul ignore if */
	    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
	        throw new Error("ajv implementation error");
	    }
	    const deps = def.dependencies;
	    if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
	        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
	    }
	    if (def.validateSchema) {
	        const valid = def.validateSchema(schema[keyword]);
	        if (!valid) {
	            const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` +
	                self.errorsText(def.validateSchema.errors);
	            if (opts.validateSchema === "log")
	                self.logger.error(msg);
	            else
	                throw new Error(msg);
	        }
	    }
	}
	keyword.validateKeywordUsage = validateKeywordUsage;
	
	return keyword;
}

var subschema = {};

var hasRequiredSubschema;

function requireSubschema () {
	if (hasRequiredSubschema) return subschema;
	hasRequiredSubschema = 1;
	Object.defineProperty(subschema, "__esModule", { value: true });
	subschema.extendSubschemaMode = subschema.extendSubschemaData = subschema.getSubschema = void 0;
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
	    if (keyword !== undefined && schema !== undefined) {
	        throw new Error('both "keyword" and "schema" passed, only one allowed');
	    }
	    if (keyword !== undefined) {
	        const sch = it.schema[keyword];
	        return schemaProp === undefined
	            ? {
	                schema: sch,
	                schemaPath: (0, codegen_1._) `${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
	                errSchemaPath: `${it.errSchemaPath}/${keyword}`,
	            }
	            : {
	                schema: sch[schemaProp],
	                schemaPath: (0, codegen_1._) `${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
	                errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`,
	            };
	    }
	    if (schema !== undefined) {
	        if (schemaPath === undefined || errSchemaPath === undefined || topSchemaRef === undefined) {
	            throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
	        }
	        return {
	            schema,
	            schemaPath,
	            topSchemaRef,
	            errSchemaPath,
	        };
	    }
	    throw new Error('either "keyword" or "schema" must be passed');
	}
	subschema.getSubschema = getSubschema;
	function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
	    if (data !== undefined && dataProp !== undefined) {
	        throw new Error('both "data" and "dataProp" passed, only one allowed');
	    }
	    const { gen } = it;
	    if (dataProp !== undefined) {
	        const { errorPath, dataPathArr, opts } = it;
	        const nextData = gen.let("data", (0, codegen_1._) `${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
	        dataContextProps(nextData);
	        subschema.errorPath = (0, codegen_1.str) `${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
	        subschema.parentDataProperty = (0, codegen_1._) `${dataProp}`;
	        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
	    }
	    if (data !== undefined) {
	        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true); // replaceable if used once?
	        dataContextProps(nextData);
	        if (propertyName !== undefined)
	            subschema.propertyName = propertyName;
	        // TODO something is possibly wrong here with not changing parentDataProperty and not appending dataPathArr
	    }
	    if (dataTypes)
	        subschema.dataTypes = dataTypes;
	    function dataContextProps(_nextData) {
	        subschema.data = _nextData;
	        subschema.dataLevel = it.dataLevel + 1;
	        subschema.dataTypes = [];
	        it.definedProperties = new Set();
	        subschema.parentData = it.data;
	        subschema.dataNames = [...it.dataNames, _nextData];
	    }
	}
	subschema.extendSubschemaData = extendSubschemaData;
	function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
	    if (compositeRule !== undefined)
	        subschema.compositeRule = compositeRule;
	    if (createErrors !== undefined)
	        subschema.createErrors = createErrors;
	    if (allErrors !== undefined)
	        subschema.allErrors = allErrors;
	    subschema.jtdDiscriminator = jtdDiscriminator; // not inherited
	    subschema.jtdMetadata = jtdMetadata; // not inherited
	}
	subschema.extendSubschemaMode = extendSubschemaMode;
	
	return subschema;
}

var resolve = {};

var fastDeepEqual;
var hasRequiredFastDeepEqual;

function requireFastDeepEqual () {
	if (hasRequiredFastDeepEqual) return fastDeepEqual;
	hasRequiredFastDeepEqual = 1;

	// do not edit .js files directly - edit src/index.jst



	fastDeepEqual = function equal(a, b) {
	  if (a === b) return true;

	  if (a && b && typeof a == 'object' && typeof b == 'object') {
	    if (a.constructor !== b.constructor) return false;

	    var length, i, keys;
	    if (Array.isArray(a)) {
	      length = a.length;
	      if (length != b.length) return false;
	      for (i = length; i-- !== 0;)
	        if (!equal(a[i], b[i])) return false;
	      return true;
	    }



	    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
	    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
	    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();

	    keys = Object.keys(a);
	    length = keys.length;
	    if (length !== Object.keys(b).length) return false;

	    for (i = length; i-- !== 0;)
	      if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;

	    for (i = length; i-- !== 0;) {
	      var key = keys[i];

	      if (!equal(a[key], b[key])) return false;
	    }

	    return true;
	  }

	  // true if both NaN, false otherwise
	  return a!==a && b!==b;
	};
	return fastDeepEqual;
}

var jsonSchemaTraverse = {exports: {}};

var hasRequiredJsonSchemaTraverse;

function requireJsonSchemaTraverse () {
	if (hasRequiredJsonSchemaTraverse) return jsonSchemaTraverse.exports;
	hasRequiredJsonSchemaTraverse = 1;

	var traverse = jsonSchemaTraverse.exports = function (schema, opts, cb) {
	  // Legacy support for v0.3.1 and earlier.
	  if (typeof opts == 'function') {
	    cb = opts;
	    opts = {};
	  }

	  cb = opts.cb || cb;
	  var pre = (typeof cb == 'function') ? cb : cb.pre || function() {};
	  var post = cb.post || function() {};

	  _traverse(opts, pre, post, schema, '', schema);
	};


	traverse.keywords = {
	  additionalItems: true,
	  items: true,
	  contains: true,
	  additionalProperties: true,
	  propertyNames: true,
	  not: true,
	  if: true,
	  then: true,
	  else: true
	};

	traverse.arrayKeywords = {
	  items: true,
	  allOf: true,
	  anyOf: true,
	  oneOf: true
	};

	traverse.propsKeywords = {
	  $defs: true,
	  definitions: true,
	  properties: true,
	  patternProperties: true,
	  dependencies: true
	};

	traverse.skipKeywords = {
	  default: true,
	  enum: true,
	  const: true,
	  required: true,
	  maximum: true,
	  minimum: true,
	  exclusiveMaximum: true,
	  exclusiveMinimum: true,
	  multipleOf: true,
	  maxLength: true,
	  minLength: true,
	  pattern: true,
	  format: true,
	  maxItems: true,
	  minItems: true,
	  uniqueItems: true,
	  maxProperties: true,
	  minProperties: true
	};


	function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
	  if (schema && typeof schema == 'object' && !Array.isArray(schema)) {
	    pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
	    for (var key in schema) {
	      var sch = schema[key];
	      if (Array.isArray(sch)) {
	        if (key in traverse.arrayKeywords) {
	          for (var i=0; i<sch.length; i++)
	            _traverse(opts, pre, post, sch[i], jsonPtr + '/' + key + '/' + i, rootSchema, jsonPtr, key, schema, i);
	        }
	      } else if (key in traverse.propsKeywords) {
	        if (sch && typeof sch == 'object') {
	          for (var prop in sch)
	            _traverse(opts, pre, post, sch[prop], jsonPtr + '/' + key + '/' + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
	        }
	      } else if (key in traverse.keywords || (opts.allKeys && !(key in traverse.skipKeywords))) {
	        _traverse(opts, pre, post, sch, jsonPtr + '/' + key, rootSchema, jsonPtr, key, schema);
	      }
	    }
	    post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
	  }
	}


	function escapeJsonPtr(str) {
	  return str.replace(/~/g, '~0').replace(/\//g, '~1');
	}
	return jsonSchemaTraverse.exports;
}

var hasRequiredResolve;

function requireResolve () {
	if (hasRequiredResolve) return resolve;
	hasRequiredResolve = 1;
	Object.defineProperty(resolve, "__esModule", { value: true });
	resolve.getSchemaRefs = resolve.resolveUrl = resolve.normalizeId = resolve._getFullPath = resolve.getFullPath = resolve.inlineRef = void 0;
	const util_1 = requireUtil();
	const equal = requireFastDeepEqual();
	const traverse = requireJsonSchemaTraverse();
	// TODO refactor to use keyword definitions
	const SIMPLE_INLINED = new Set([
	    "type",
	    "format",
	    "pattern",
	    "maxLength",
	    "minLength",
	    "maxProperties",
	    "minProperties",
	    "maxItems",
	    "minItems",
	    "maximum",
	    "minimum",
	    "uniqueItems",
	    "multipleOf",
	    "required",
	    "enum",
	    "const",
	]);
	function inlineRef(schema, limit = true) {
	    if (typeof schema == "boolean")
	        return true;
	    if (limit === true)
	        return !hasRef(schema);
	    if (!limit)
	        return false;
	    return countKeys(schema) <= limit;
	}
	resolve.inlineRef = inlineRef;
	const REF_KEYWORDS = new Set([
	    "$ref",
	    "$recursiveRef",
	    "$recursiveAnchor",
	    "$dynamicRef",
	    "$dynamicAnchor",
	]);
	function hasRef(schema) {
	    for (const key in schema) {
	        if (REF_KEYWORDS.has(key))
	            return true;
	        const sch = schema[key];
	        if (Array.isArray(sch) && sch.some(hasRef))
	            return true;
	        if (typeof sch == "object" && hasRef(sch))
	            return true;
	    }
	    return false;
	}
	function countKeys(schema) {
	    let count = 0;
	    for (const key in schema) {
	        if (key === "$ref")
	            return Infinity;
	        count++;
	        if (SIMPLE_INLINED.has(key))
	            continue;
	        if (typeof schema[key] == "object") {
	            (0, util_1.eachItem)(schema[key], (sch) => (count += countKeys(sch)));
	        }
	        if (count === Infinity)
	            return Infinity;
	    }
	    return count;
	}
	function getFullPath(resolver, id = "", normalize) {
	    if (normalize !== false)
	        id = normalizeId(id);
	    const p = resolver.parse(id);
	    return _getFullPath(resolver, p);
	}
	resolve.getFullPath = getFullPath;
	function _getFullPath(resolver, p) {
	    const serialized = resolver.serialize(p);
	    return serialized.split("#")[0] + "#";
	}
	resolve._getFullPath = _getFullPath;
	const TRAILING_SLASH_HASH = /#\/?$/;
	function normalizeId(id) {
	    return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
	}
	resolve.normalizeId = normalizeId;
	function resolveUrl(resolver, baseId, id) {
	    id = normalizeId(id);
	    return resolver.resolve(baseId, id);
	}
	resolve.resolveUrl = resolveUrl;
	const ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
	function getSchemaRefs(schema, baseId) {
	    if (typeof schema == "boolean")
	        return {};
	    const { schemaId, uriResolver } = this.opts;
	    const schId = normalizeId(schema[schemaId] || baseId);
	    const baseIds = { "": schId };
	    const pathPrefix = getFullPath(uriResolver, schId, false);
	    const localRefs = {};
	    const schemaRefs = new Set();
	    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
	        if (parentJsonPtr === undefined)
	            return;
	        const fullPath = pathPrefix + jsonPtr;
	        let innerBaseId = baseIds[parentJsonPtr];
	        if (typeof sch[schemaId] == "string")
	            innerBaseId = addRef.call(this, sch[schemaId]);
	        addAnchor.call(this, sch.$anchor);
	        addAnchor.call(this, sch.$dynamicAnchor);
	        baseIds[jsonPtr] = innerBaseId;
	        function addRef(ref) {
	            // eslint-disable-next-line @typescript-eslint/unbound-method
	            const _resolve = this.opts.uriResolver.resolve;
	            ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
	            if (schemaRefs.has(ref))
	                throw ambiguos(ref);
	            schemaRefs.add(ref);
	            let schOrRef = this.refs[ref];
	            if (typeof schOrRef == "string")
	                schOrRef = this.refs[schOrRef];
	            if (typeof schOrRef == "object") {
	                checkAmbiguosRef(sch, schOrRef.schema, ref);
	            }
	            else if (ref !== normalizeId(fullPath)) {
	                if (ref[0] === "#") {
	                    checkAmbiguosRef(sch, localRefs[ref], ref);
	                    localRefs[ref] = sch;
	                }
	                else {
	                    this.refs[ref] = fullPath;
	                }
	            }
	            return ref;
	        }
	        function addAnchor(anchor) {
	            if (typeof anchor == "string") {
	                if (!ANCHOR.test(anchor))
	                    throw new Error(`invalid anchor "${anchor}"`);
	                addRef.call(this, `#${anchor}`);
	            }
	        }
	    });
	    return localRefs;
	    function checkAmbiguosRef(sch1, sch2, ref) {
	        if (sch2 !== undefined && !equal(sch1, sch2))
	            throw ambiguos(ref);
	    }
	    function ambiguos(ref) {
	        return new Error(`reference "${ref}" resolves to more than one schema`);
	    }
	}
	resolve.getSchemaRefs = getSchemaRefs;
	
	return resolve;
}

var hasRequiredValidate;

function requireValidate () {
	if (hasRequiredValidate) return validate;
	hasRequiredValidate = 1;
	Object.defineProperty(validate, "__esModule", { value: true });
	validate.getData = validate.KeywordCxt = validate.validateFunctionCode = void 0;
	const boolSchema_1 = requireBoolSchema();
	const dataType_1 = requireDataType();
	const applicability_1 = requireApplicability();
	const dataType_2 = requireDataType();
	const defaults_1 = requireDefaults();
	const keyword_1 = requireKeyword();
	const subschema_1 = requireSubschema();
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const resolve_1 = requireResolve();
	const util_1 = requireUtil();
	const errors_1 = requireErrors();
	// schema compilation - generates validation function, subschemaCode (below) is used for subschemas
	function validateFunctionCode(it) {
	    if (isSchemaObj(it)) {
	        checkKeywords(it);
	        if (schemaCxtHasRules(it)) {
	            topSchemaObjCode(it);
	            return;
	        }
	    }
	    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
	}
	validate.validateFunctionCode = validateFunctionCode;
	function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
	    if (opts.code.es5) {
	        gen.func(validateName, (0, codegen_1._) `${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
	            gen.code((0, codegen_1._) `"use strict"; ${funcSourceUrl(schema, opts)}`);
	            destructureValCxtES5(gen, opts);
	            gen.code(body);
	        });
	    }
	    else {
	        gen.func(validateName, (0, codegen_1._) `${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
	    }
	}
	function destructureValCxt(opts) {
	    return (0, codegen_1._) `{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._) `, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
	}
	function destructureValCxtES5(gen, opts) {
	    gen.if(names_1.default.valCxt, () => {
	        gen.var(names_1.default.instancePath, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.instancePath}`);
	        gen.var(names_1.default.parentData, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.parentData}`);
	        gen.var(names_1.default.parentDataProperty, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
	        gen.var(names_1.default.rootData, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.rootData}`);
	        if (opts.dynamicRef)
	            gen.var(names_1.default.dynamicAnchors, (0, codegen_1._) `${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
	    }, () => {
	        gen.var(names_1.default.instancePath, (0, codegen_1._) `""`);
	        gen.var(names_1.default.parentData, (0, codegen_1._) `undefined`);
	        gen.var(names_1.default.parentDataProperty, (0, codegen_1._) `undefined`);
	        gen.var(names_1.default.rootData, names_1.default.data);
	        if (opts.dynamicRef)
	            gen.var(names_1.default.dynamicAnchors, (0, codegen_1._) `{}`);
	    });
	}
	function topSchemaObjCode(it) {
	    const { schema, opts, gen } = it;
	    validateFunction(it, () => {
	        if (opts.$comment && schema.$comment)
	            commentKeyword(it);
	        checkNoDefault(it);
	        gen.let(names_1.default.vErrors, null);
	        gen.let(names_1.default.errors, 0);
	        if (opts.unevaluated)
	            resetEvaluated(it);
	        typeAndKeywords(it);
	        returnResults(it);
	    });
	    return;
	}
	function resetEvaluated(it) {
	    // TODO maybe some hook to execute it in the end to check whether props/items are Name, as in assignEvaluated
	    const { gen, validateName } = it;
	    it.evaluated = gen.const("evaluated", (0, codegen_1._) `${validateName}.evaluated`);
	    gen.if((0, codegen_1._) `${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._) `${it.evaluated}.props`, (0, codegen_1._) `undefined`));
	    gen.if((0, codegen_1._) `${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._) `${it.evaluated}.items`, (0, codegen_1._) `undefined`));
	}
	function funcSourceUrl(schema, opts) {
	    const schId = typeof schema == "object" && schema[opts.schemaId];
	    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._) `/*# sourceURL=${schId} */` : codegen_1.nil;
	}
	// schema compilation - this function is used recursively to generate code for sub-schemas
	function subschemaCode(it, valid) {
	    if (isSchemaObj(it)) {
	        checkKeywords(it);
	        if (schemaCxtHasRules(it)) {
	            subSchemaObjCode(it, valid);
	            return;
	        }
	    }
	    (0, boolSchema_1.boolOrEmptySchema)(it, valid);
	}
	function schemaCxtHasRules({ schema, self }) {
	    if (typeof schema == "boolean")
	        return !schema;
	    for (const key in schema)
	        if (self.RULES.all[key])
	            return true;
	    return false;
	}
	function isSchemaObj(it) {
	    return typeof it.schema != "boolean";
	}
	function subSchemaObjCode(it, valid) {
	    const { schema, gen, opts } = it;
	    if (opts.$comment && schema.$comment)
	        commentKeyword(it);
	    updateContext(it);
	    checkAsyncSchema(it);
	    const errsCount = gen.const("_errs", names_1.default.errors);
	    typeAndKeywords(it, errsCount);
	    // TODO var
	    gen.var(valid, (0, codegen_1._) `${errsCount} === ${names_1.default.errors}`);
	}
	function checkKeywords(it) {
	    (0, util_1.checkUnknownRules)(it);
	    checkRefsAndKeywords(it);
	}
	function typeAndKeywords(it, errsCount) {
	    if (it.opts.jtd)
	        return schemaKeywords(it, [], false, errsCount);
	    const types = (0, dataType_1.getSchemaTypes)(it.schema);
	    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
	    schemaKeywords(it, types, !checkedTypes, errsCount);
	}
	function checkRefsAndKeywords(it) {
	    const { schema, errSchemaPath, opts, self } = it;
	    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
	        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
	    }
	}
	function checkNoDefault(it) {
	    const { schema, opts } = it;
	    if (schema.default !== undefined && opts.useDefaults && opts.strictSchema) {
	        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
	    }
	}
	function updateContext(it) {
	    const schId = it.schema[it.opts.schemaId];
	    if (schId)
	        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
	}
	function checkAsyncSchema(it) {
	    if (it.schema.$async && !it.schemaEnv.$async)
	        throw new Error("async schema in sync schema");
	}
	function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
	    const msg = schema.$comment;
	    if (opts.$comment === true) {
	        gen.code((0, codegen_1._) `${names_1.default.self}.logger.log(${msg})`);
	    }
	    else if (typeof opts.$comment == "function") {
	        const schemaPath = (0, codegen_1.str) `${errSchemaPath}/$comment`;
	        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
	        gen.code((0, codegen_1._) `${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
	    }
	}
	function returnResults(it) {
	    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
	    if (schemaEnv.$async) {
	        // TODO assign unevaluated
	        gen.if((0, codegen_1._) `${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._) `new ${ValidationError}(${names_1.default.vErrors})`));
	    }
	    else {
	        gen.assign((0, codegen_1._) `${validateName}.errors`, names_1.default.vErrors);
	        if (opts.unevaluated)
	            assignEvaluated(it);
	        gen.return((0, codegen_1._) `${names_1.default.errors} === 0`);
	    }
	}
	function assignEvaluated({ gen, evaluated, props, items }) {
	    if (props instanceof codegen_1.Name)
	        gen.assign((0, codegen_1._) `${evaluated}.props`, props);
	    if (items instanceof codegen_1.Name)
	        gen.assign((0, codegen_1._) `${evaluated}.items`, items);
	}
	function schemaKeywords(it, types, typeErrors, errsCount) {
	    const { gen, schema, data, allErrors, opts, self } = it;
	    const { RULES } = self;
	    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
	        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition)); // TODO typecast
	        return;
	    }
	    if (!opts.jtd)
	        checkStrictTypes(it, types);
	    gen.block(() => {
	        for (const group of RULES.rules)
	            groupKeywords(group);
	        groupKeywords(RULES.post);
	    });
	    function groupKeywords(group) {
	        if (!(0, applicability_1.shouldUseGroup)(schema, group))
	            return;
	        if (group.type) {
	            gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
	            iterateKeywords(it, group);
	            if (types.length === 1 && types[0] === group.type && typeErrors) {
	                gen.else();
	                (0, dataType_2.reportTypeError)(it);
	            }
	            gen.endIf();
	        }
	        else {
	            iterateKeywords(it, group);
	        }
	        // TODO make it "ok" call?
	        if (!allErrors)
	            gen.if((0, codegen_1._) `${names_1.default.errors} === ${errsCount || 0}`);
	    }
	}
	function iterateKeywords(it, group) {
	    const { gen, schema, opts: { useDefaults }, } = it;
	    if (useDefaults)
	        (0, defaults_1.assignDefaults)(it, group.type);
	    gen.block(() => {
	        for (const rule of group.rules) {
	            if ((0, applicability_1.shouldUseRule)(schema, rule)) {
	                keywordCode(it, rule.keyword, rule.definition, group.type);
	            }
	        }
	    });
	}
	function checkStrictTypes(it, types) {
	    if (it.schemaEnv.meta || !it.opts.strictTypes)
	        return;
	    checkContextTypes(it, types);
	    if (!it.opts.allowUnionTypes)
	        checkMultipleTypes(it, types);
	    checkKeywordTypes(it, it.dataTypes);
	}
	function checkContextTypes(it, types) {
	    if (!types.length)
	        return;
	    if (!it.dataTypes.length) {
	        it.dataTypes = types;
	        return;
	    }
	    types.forEach((t) => {
	        if (!includesType(it.dataTypes, t)) {
	            strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
	        }
	    });
	    narrowSchemaTypes(it, types);
	}
	function checkMultipleTypes(it, ts) {
	    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
	        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
	    }
	}
	function checkKeywordTypes(it, ts) {
	    const rules = it.self.RULES.all;
	    for (const keyword in rules) {
	        const rule = rules[keyword];
	        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
	            const { type } = rule.definition;
	            if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
	                strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
	            }
	        }
	    }
	}
	function hasApplicableType(schTs, kwdT) {
	    return schTs.includes(kwdT) || (kwdT === "number" && schTs.includes("integer"));
	}
	function includesType(ts, t) {
	    return ts.includes(t) || (t === "integer" && ts.includes("number"));
	}
	function narrowSchemaTypes(it, withTypes) {
	    const ts = [];
	    for (const t of it.dataTypes) {
	        if (includesType(withTypes, t))
	            ts.push(t);
	        else if (withTypes.includes("integer") && t === "number")
	            ts.push("integer");
	    }
	    it.dataTypes = ts;
	}
	function strictTypesError(it, msg) {
	    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
	    msg += ` at "${schemaPath}" (strictTypes)`;
	    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
	}
	class KeywordCxt {
	    constructor(it, def, keyword) {
	        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
	        this.gen = it.gen;
	        this.allErrors = it.allErrors;
	        this.keyword = keyword;
	        this.data = it.data;
	        this.schema = it.schema[keyword];
	        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
	        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
	        this.schemaType = def.schemaType;
	        this.parentSchema = it.schema;
	        this.params = {};
	        this.it = it;
	        this.def = def;
	        if (this.$data) {
	            this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
	        }
	        else {
	            this.schemaCode = this.schemaValue;
	            if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
	                throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
	            }
	        }
	        if ("code" in def ? def.trackErrors : def.errors !== false) {
	            this.errsCount = it.gen.const("_errs", names_1.default.errors);
	        }
	    }
	    result(condition, successAction, failAction) {
	        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
	    }
	    failResult(condition, successAction, failAction) {
	        this.gen.if(condition);
	        if (failAction)
	            failAction();
	        else
	            this.error();
	        if (successAction) {
	            this.gen.else();
	            successAction();
	            if (this.allErrors)
	                this.gen.endIf();
	        }
	        else {
	            if (this.allErrors)
	                this.gen.endIf();
	            else
	                this.gen.else();
	        }
	    }
	    pass(condition, failAction) {
	        this.failResult((0, codegen_1.not)(condition), undefined, failAction);
	    }
	    fail(condition) {
	        if (condition === undefined) {
	            this.error();
	            if (!this.allErrors)
	                this.gen.if(false); // this branch will be removed by gen.optimize
	            return;
	        }
	        this.gen.if(condition);
	        this.error();
	        if (this.allErrors)
	            this.gen.endIf();
	        else
	            this.gen.else();
	    }
	    fail$data(condition) {
	        if (!this.$data)
	            return this.fail(condition);
	        const { schemaCode } = this;
	        this.fail((0, codegen_1._) `${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
	    }
	    error(append, errorParams, errorPaths) {
	        if (errorParams) {
	            this.setParams(errorParams);
	            this._error(append, errorPaths);
	            this.setParams({});
	            return;
	        }
	        this._error(append, errorPaths);
	    }
	    _error(append, errorPaths) {
	        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
	    }
	    $dataError() {
	        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
	    }
	    reset() {
	        if (this.errsCount === undefined)
	            throw new Error('add "trackErrors" to keyword definition');
	        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
	    }
	    ok(cond) {
	        if (!this.allErrors)
	            this.gen.if(cond);
	    }
	    setParams(obj, assign) {
	        if (assign)
	            Object.assign(this.params, obj);
	        else
	            this.params = obj;
	    }
	    block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
	        this.gen.block(() => {
	            this.check$data(valid, $dataValid);
	            codeBlock();
	        });
	    }
	    check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
	        if (!this.$data)
	            return;
	        const { gen, schemaCode, schemaType, def } = this;
	        gen.if((0, codegen_1.or)((0, codegen_1._) `${schemaCode} === undefined`, $dataValid));
	        if (valid !== codegen_1.nil)
	            gen.assign(valid, true);
	        if (schemaType.length || def.validateSchema) {
	            gen.elseIf(this.invalid$data());
	            this.$dataError();
	            if (valid !== codegen_1.nil)
	                gen.assign(valid, false);
	        }
	        gen.else();
	    }
	    invalid$data() {
	        const { gen, schemaCode, schemaType, def, it } = this;
	        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
	        function wrong$DataType() {
	            if (schemaType.length) {
	                /* istanbul ignore if */
	                if (!(schemaCode instanceof codegen_1.Name))
	                    throw new Error("ajv implementation error");
	                const st = Array.isArray(schemaType) ? schemaType : [schemaType];
	                return (0, codegen_1._) `${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
	            }
	            return codegen_1.nil;
	        }
	        function invalid$DataSchema() {
	            if (def.validateSchema) {
	                const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema }); // TODO value.code for standalone
	                return (0, codegen_1._) `!${validateSchemaRef}(${schemaCode})`;
	            }
	            return codegen_1.nil;
	        }
	    }
	    subschema(appl, valid) {
	        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
	        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
	        (0, subschema_1.extendSubschemaMode)(subschema, appl);
	        const nextContext = { ...this.it, ...subschema, items: undefined, props: undefined };
	        subschemaCode(nextContext, valid);
	        return nextContext;
	    }
	    mergeEvaluated(schemaCxt, toName) {
	        const { it, gen } = this;
	        if (!it.opts.unevaluated)
	            return;
	        if (it.props !== true && schemaCxt.props !== undefined) {
	            it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
	        }
	        if (it.items !== true && schemaCxt.items !== undefined) {
	            it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
	        }
	    }
	    mergeValidEvaluated(schemaCxt, valid) {
	        const { it, gen } = this;
	        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
	            gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
	            return true;
	        }
	    }
	}
	validate.KeywordCxt = KeywordCxt;
	function keywordCode(it, keyword, def, ruleType) {
	    const cxt = new KeywordCxt(it, def, keyword);
	    if ("code" in def) {
	        def.code(cxt, ruleType);
	    }
	    else if (cxt.$data && def.validate) {
	        (0, keyword_1.funcKeywordCode)(cxt, def);
	    }
	    else if ("macro" in def) {
	        (0, keyword_1.macroKeywordCode)(cxt, def);
	    }
	    else if (def.compile || def.validate) {
	        (0, keyword_1.funcKeywordCode)(cxt, def);
	    }
	}
	const JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
	const RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
	function getData($data, { dataLevel, dataNames, dataPathArr }) {
	    let jsonPointer;
	    let data;
	    if ($data === "")
	        return names_1.default.rootData;
	    if ($data[0] === "/") {
	        if (!JSON_POINTER.test($data))
	            throw new Error(`Invalid JSON-pointer: ${$data}`);
	        jsonPointer = $data;
	        data = names_1.default.rootData;
	    }
	    else {
	        const matches = RELATIVE_JSON_POINTER.exec($data);
	        if (!matches)
	            throw new Error(`Invalid JSON-pointer: ${$data}`);
	        const up = +matches[1];
	        jsonPointer = matches[2];
	        if (jsonPointer === "#") {
	            if (up >= dataLevel)
	                throw new Error(errorMsg("property/index", up));
	            return dataPathArr[dataLevel - up];
	        }
	        if (up > dataLevel)
	            throw new Error(errorMsg("data", up));
	        data = dataNames[dataLevel - up];
	        if (!jsonPointer)
	            return data;
	    }
	    let expr = data;
	    const segments = jsonPointer.split("/");
	    for (const segment of segments) {
	        if (segment) {
	            data = (0, codegen_1._) `${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
	            expr = (0, codegen_1._) `${expr} && ${data}`;
	        }
	    }
	    return expr;
	    function errorMsg(pointerType, up) {
	        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
	    }
	}
	validate.getData = getData;
	
	return validate;
}

var validation_error = {};

var hasRequiredValidation_error;

function requireValidation_error () {
	if (hasRequiredValidation_error) return validation_error;
	hasRequiredValidation_error = 1;
	Object.defineProperty(validation_error, "__esModule", { value: true });
	class ValidationError extends Error {
	    constructor(errors) {
	        super("validation failed");
	        this.errors = errors;
	        this.ajv = this.validation = true;
	    }
	}
	validation_error.default = ValidationError;
	
	return validation_error;
}

var ref_error = {};

var hasRequiredRef_error;

function requireRef_error () {
	if (hasRequiredRef_error) return ref_error;
	hasRequiredRef_error = 1;
	Object.defineProperty(ref_error, "__esModule", { value: true });
	const resolve_1 = requireResolve();
	class MissingRefError extends Error {
	    constructor(resolver, baseId, ref, msg) {
	        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
	        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
	        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
	    }
	}
	ref_error.default = MissingRefError;
	
	return ref_error;
}

var compile = {};

var hasRequiredCompile;

function requireCompile () {
	if (hasRequiredCompile) return compile;
	hasRequiredCompile = 1;
	Object.defineProperty(compile, "__esModule", { value: true });
	compile.resolveSchema = compile.getCompilingSchema = compile.resolveRef = compile.compileSchema = compile.SchemaEnv = void 0;
	const codegen_1 = requireCodegen();
	const validation_error_1 = requireValidation_error();
	const names_1 = requireNames();
	const resolve_1 = requireResolve();
	const util_1 = requireUtil();
	const validate_1 = requireValidate();
	class SchemaEnv {
	    constructor(env) {
	        var _a;
	        this.refs = {};
	        this.dynamicAnchors = {};
	        let schema;
	        if (typeof env.schema == "object")
	            schema = env.schema;
	        this.schema = env.schema;
	        this.schemaId = env.schemaId;
	        this.root = env.root || this;
	        this.baseId = (_a = env.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema === null || schema === void 0 ? void 0 : schema[env.schemaId || "$id"]);
	        this.schemaPath = env.schemaPath;
	        this.localRefs = env.localRefs;
	        this.meta = env.meta;
	        this.$async = schema === null || schema === void 0 ? void 0 : schema.$async;
	        this.refs = {};
	    }
	}
	compile.SchemaEnv = SchemaEnv;
	// let codeSize = 0
	// let nodeCount = 0
	// Compiles schema in SchemaEnv
	function compileSchema(sch) {
	    // TODO refactor - remove compilations
	    const _sch = getCompilingSchema.call(this, sch);
	    if (_sch)
	        return _sch;
	    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId); // TODO if getFullPath removed 1 tests fails
	    const { es5, lines } = this.opts.code;
	    const { ownProperties } = this.opts;
	    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
	    let _ValidationError;
	    if (sch.$async) {
	        _ValidationError = gen.scopeValue("Error", {
	            ref: validation_error_1.default,
	            code: (0, codegen_1._) `require("ajv/dist/runtime/validation_error").default`,
	        });
	    }
	    const validateName = gen.scopeName("validate");
	    sch.validateName = validateName;
	    const schemaCxt = {
	        gen,
	        allErrors: this.opts.allErrors,
	        data: names_1.default.data,
	        parentData: names_1.default.parentData,
	        parentDataProperty: names_1.default.parentDataProperty,
	        dataNames: [names_1.default.data],
	        dataPathArr: [codegen_1.nil], // TODO can its length be used as dataLevel if nil is removed?
	        dataLevel: 0,
	        dataTypes: [],
	        definedProperties: new Set(),
	        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true
	            ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) }
	            : { ref: sch.schema }),
	        validateName,
	        ValidationError: _ValidationError,
	        schema: sch.schema,
	        schemaEnv: sch,
	        rootId,
	        baseId: sch.baseId || rootId,
	        schemaPath: codegen_1.nil,
	        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
	        errorPath: (0, codegen_1._) `""`,
	        opts: this.opts,
	        self: this,
	    };
	    let sourceCode;
	    try {
	        this._compilations.add(sch);
	        (0, validate_1.validateFunctionCode)(schemaCxt);
	        gen.optimize(this.opts.code.optimize);
	        // gen.optimize(1)
	        const validateCode = gen.toString();
	        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
	        // console.log((codeSize += sourceCode.length), (nodeCount += gen.nodeCount))
	        if (this.opts.code.process)
	            sourceCode = this.opts.code.process(sourceCode, sch);
	        // console.log("\n\n\n *** \n", sourceCode)
	        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
	        const validate = makeValidate(this, this.scope.get());
	        this.scope.value(validateName, { ref: validate });
	        validate.errors = null;
	        validate.schema = sch.schema;
	        validate.schemaEnv = sch;
	        if (sch.$async)
	            validate.$async = true;
	        if (this.opts.code.source === true) {
	            validate.source = { validateName, validateCode, scopeValues: gen._values };
	        }
	        if (this.opts.unevaluated) {
	            const { props, items } = schemaCxt;
	            validate.evaluated = {
	                props: props instanceof codegen_1.Name ? undefined : props,
	                items: items instanceof codegen_1.Name ? undefined : items,
	                dynamicProps: props instanceof codegen_1.Name,
	                dynamicItems: items instanceof codegen_1.Name,
	            };
	            if (validate.source)
	                validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
	        }
	        sch.validate = validate;
	        return sch;
	    }
	    catch (e) {
	        delete sch.validate;
	        delete sch.validateName;
	        if (sourceCode)
	            this.logger.error("Error compiling schema, function code:", sourceCode);
	        // console.log("\n\n\n *** \n", sourceCode, this.opts)
	        throw e;
	    }
	    finally {
	        this._compilations.delete(sch);
	    }
	}
	compile.compileSchema = compileSchema;
	function resolveRef(root, baseId, ref) {
	    var _a;
	    ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
	    const schOrFunc = root.refs[ref];
	    if (schOrFunc)
	        return schOrFunc;
	    let _sch = resolve.call(this, root, ref);
	    if (_sch === undefined) {
	        const schema = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref]; // TODO maybe localRefs should hold SchemaEnv
	        const { schemaId } = this.opts;
	        if (schema)
	            _sch = new SchemaEnv({ schema, schemaId, root, baseId });
	    }
	    if (_sch === undefined)
	        return;
	    return (root.refs[ref] = inlineOrCompile.call(this, _sch));
	}
	compile.resolveRef = resolveRef;
	function inlineOrCompile(sch) {
	    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
	        return sch.schema;
	    return sch.validate ? sch : compileSchema.call(this, sch);
	}
	// Index of schema compilation in the currently compiled list
	function getCompilingSchema(schEnv) {
	    for (const sch of this._compilations) {
	        if (sameSchemaEnv(sch, schEnv))
	            return sch;
	    }
	}
	compile.getCompilingSchema = getCompilingSchema;
	function sameSchemaEnv(s1, s2) {
	    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
	}
	// resolve and compile the references ($ref)
	// TODO returns AnySchemaObject (if the schema can be inlined) or validation function
	function resolve(root, // information about the root schema for the current schema
	ref // reference to resolve
	) {
	    let sch;
	    while (typeof (sch = this.refs[ref]) == "string")
	        ref = sch;
	    return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
	}
	// Resolve schema, its root and baseId
	function resolveSchema(root, // root object with properties schema, refs TODO below SchemaEnv is assigned to it
	ref // reference to resolve
	) {
	    const p = this.opts.uriResolver.parse(ref);
	    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
	    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, undefined);
	    // TODO `Object.keys(root.schema).length > 0` should not be needed - but removing breaks 2 tests
	    if (Object.keys(root.schema).length > 0 && refPath === baseId) {
	        return getJsonPointer.call(this, p, root);
	    }
	    const id = (0, resolve_1.normalizeId)(refPath);
	    const schOrRef = this.refs[id] || this.schemas[id];
	    if (typeof schOrRef == "string") {
	        const sch = resolveSchema.call(this, root, schOrRef);
	        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
	            return;
	        return getJsonPointer.call(this, p, sch);
	    }
	    if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
	        return;
	    if (!schOrRef.validate)
	        compileSchema.call(this, schOrRef);
	    if (id === (0, resolve_1.normalizeId)(ref)) {
	        const { schema } = schOrRef;
	        const { schemaId } = this.opts;
	        const schId = schema[schemaId];
	        if (schId)
	            baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
	        return new SchemaEnv({ schema, schemaId, root, baseId });
	    }
	    return getJsonPointer.call(this, p, schOrRef);
	}
	compile.resolveSchema = resolveSchema;
	const PREVENT_SCOPE_CHANGE = new Set([
	    "properties",
	    "patternProperties",
	    "enum",
	    "dependencies",
	    "definitions",
	]);
	function getJsonPointer(parsedRef, { baseId, schema, root }) {
	    var _a;
	    if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
	        return;
	    for (const part of parsedRef.fragment.slice(1).split("/")) {
	        if (typeof schema === "boolean")
	            return;
	        const partSchema = schema[(0, util_1.unescapeFragment)(part)];
	        if (partSchema === undefined)
	            return;
	        schema = partSchema;
	        // TODO PREVENT_SCOPE_CHANGE could be defined in keyword def?
	        const schId = typeof schema === "object" && schema[this.opts.schemaId];
	        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
	            baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
	        }
	    }
	    let env;
	    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
	        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
	        env = resolveSchema.call(this, root, $ref);
	    }
	    // even though resolution failed we need to return SchemaEnv to throw exception
	    // so that compileAsync loads missing schema.
	    const { schemaId } = this.opts;
	    env = env || new SchemaEnv({ schema, schemaId, root, baseId });
	    if (env.schema !== env.root.schema)
	        return env;
	    return undefined;
	}
	
	return compile;
}

var $id$9 = "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#";
var description$1 = "Meta-schema for $data reference (JSON AnySchema extension proposal)";
var type$8 = "object";
var required$1 = [
	"$data"
];
var properties$9 = {
	$data: {
		type: "string",
		anyOf: [
			{
				format: "relative-json-pointer"
			},
			{
				format: "json-pointer"
			}
		]
	}
};
var additionalProperties$1 = false;
var require$$9 = {
	$id: $id$9,
	description: description$1,
	type: type$8,
	required: required$1,
	properties: properties$9,
	additionalProperties: additionalProperties$1
};

var uri = {};

var fastUri = {exports: {}};

var utils;
var hasRequiredUtils;

function requireUtils () {
	if (hasRequiredUtils) return utils;
	hasRequiredUtils = 1;

	/** @type {(value: string) => boolean} */
	const isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);

	/** @type {(value: string) => boolean} */
	const isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);

	/** @type {(value: string) => boolean} */
	const isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);

	/** @type {(value: string) => boolean} */
	const isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);

	/** @type {(value: string) => boolean} */
	const isPathCharacter = RegExp.prototype.test.bind(/^[\da-z\-._~!$&'()*+,;=:@/]$/iu);

	/**
	 * @param {Array<string>} input
	 * @returns {string}
	 */
	function stringArrayToHexStripped (input) {
	  let acc = '';
	  let code = 0;
	  let i = 0;

	  for (i = 0; i < input.length; i++) {
	    code = input[i].charCodeAt(0);
	    if (code === 48) {
	      continue
	    }
	    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102))) {
	      return ''
	    }
	    acc += input[i];
	    break
	  }

	  for (i += 1; i < input.length; i++) {
	    code = input[i].charCodeAt(0);
	    if (!((code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102))) {
	      return ''
	    }
	    acc += input[i];
	  }
	  return acc
	}

	/**
	 * @typedef {Object} GetIPV6Result
	 * @property {boolean} error - Indicates if there was an error parsing the IPv6 address.
	 * @property {string} address - The parsed IPv6 address.
	 * @property {string} [zone] - The zone identifier, if present.
	 */

	/**
	 * @param {string} value
	 * @returns {boolean}
	 */
	const nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);

	/**
	 * @param {Array<string>} buffer
	 * @returns {boolean}
	 */
	function consumeIsZone (buffer) {
	  buffer.length = 0;
	  return true
	}

	/**
	 * @param {Array<string>} buffer
	 * @param {Array<string>} address
	 * @param {GetIPV6Result} output
	 * @returns {boolean}
	 */
	function consumeHextets (buffer, address, output) {
	  if (buffer.length) {
	    const hex = stringArrayToHexStripped(buffer);
	    if (hex !== '') {
	      address.push(hex);
	    } else {
	      output.error = true;
	      return false
	    }
	    buffer.length = 0;
	  }
	  return true
	}

	/**
	 * @param {string} input
	 * @returns {GetIPV6Result}
	 */
	function getIPV6 (input) {
	  let tokenCount = 0;
	  const output = { error: false, address: '', zone: '' };
	  /** @type {Array<string>} */
	  const address = [];
	  /** @type {Array<string>} */
	  const buffer = [];
	  let endipv6Encountered = false;
	  let endIpv6 = false;

	  let consume = consumeHextets;

	  for (let i = 0; i < input.length; i++) {
	    const cursor = input[i];
	    if (cursor === '[' || cursor === ']') { continue }
	    if (cursor === ':') {
	      if (endipv6Encountered === true) {
	        endIpv6 = true;
	      }
	      if (!consume(buffer, address, output)) { break }
	      if (++tokenCount > 7) {
	        // not valid
	        output.error = true;
	        break
	      }
	      if (i > 0 && input[i - 1] === ':') {
	        endipv6Encountered = true;
	      }
	      address.push(':');
	      continue
	    } else if (cursor === '%') {
	      if (!consume(buffer, address, output)) { break }
	      // switch to zone detection
	      consume = consumeIsZone;
	    } else {
	      buffer.push(cursor);
	      continue
	    }
	  }
	  if (buffer.length) {
	    if (consume === consumeIsZone) {
	      output.zone = buffer.join('');
	    } else if (endIpv6) {
	      address.push(buffer.join(''));
	    } else {
	      address.push(stringArrayToHexStripped(buffer));
	    }
	  }
	  output.address = address.join('');
	  return output
	}

	/**
	 * @typedef {Object} NormalizeIPv6Result
	 * @property {string} host - The normalized host.
	 * @property {string} [escapedHost] - The escaped host.
	 * @property {boolean} isIPV6 - Indicates if the host is an IPv6 address.
	 */

	/**
	 * @param {string} host
	 * @returns {NormalizeIPv6Result}
	 */
	function normalizeIPv6 (host) {
	  if (findToken(host, ':') < 2) { return { host, isIPV6: false } }
	  const ipv6 = getIPV6(host);

	  if (!ipv6.error) {
	    let newHost = ipv6.address;
	    let escapedHost = ipv6.address;
	    if (ipv6.zone) {
	      newHost += '%' + ipv6.zone;
	      escapedHost += '%25' + ipv6.zone;
	    }
	    return { host: newHost, isIPV6: true, escapedHost }
	  } else {
	    return { host, isIPV6: false }
	  }
	}

	/**
	 * @param {string} str
	 * @param {string} token
	 * @returns {number}
	 */
	function findToken (str, token) {
	  let ind = 0;
	  for (let i = 0; i < str.length; i++) {
	    if (str[i] === token) ind++;
	  }
	  return ind
	}

	/**
	 * @param {string} path
	 * @returns {string}
	 *
	 * @see https://datatracker.ietf.org/doc/html/rfc3986#section-5.2.4
	 */
	function removeDotSegments (path) {
	  let input = path;
	  const output = [];
	  let nextSlash = -1;
	  let len = 0;

	  // eslint-disable-next-line no-cond-assign
	  while (len = input.length) {
	    if (len === 1) {
	      if (input === '.') {
	        break
	      } else if (input === '/') {
	        output.push('/');
	        break
	      } else {
	        output.push(input);
	        break
	      }
	    } else if (len === 2) {
	      if (input[0] === '.') {
	        if (input[1] === '.') {
	          break
	        } else if (input[1] === '/') {
	          input = input.slice(2);
	          continue
	        }
	      } else if (input[0] === '/') {
	        if (input[1] === '.' || input[1] === '/') {
	          output.push('/');
	          break
	        }
	      }
	    } else if (len === 3) {
	      if (input === '/..') {
	        if (output.length !== 0) {
	          output.pop();
	        }
	        output.push('/');
	        break
	      }
	    }
	    if (input[0] === '.') {
	      if (input[1] === '.') {
	        if (input[2] === '/') {
	          input = input.slice(3);
	          continue
	        }
	      } else if (input[1] === '/') {
	        input = input.slice(2);
	        continue
	      }
	    } else if (input[0] === '/') {
	      if (input[1] === '.') {
	        if (input[2] === '/') {
	          input = input.slice(2);
	          continue
	        } else if (input[2] === '.') {
	          if (input[3] === '/') {
	            input = input.slice(3);
	            if (output.length !== 0) {
	              output.pop();
	            }
	            continue
	          }
	        }
	      }
	    }

	    // Rule 2E: Move normal path segment to output
	    if ((nextSlash = input.indexOf('/', 1)) === -1) {
	      output.push(input);
	      break
	    } else {
	      output.push(input.slice(0, nextSlash));
	      input = input.slice(nextSlash);
	    }
	  }

	  return output.join('')
	}

	/**
	 * Re-escape RFC 3986 gen-delims that must not appear literally in the host.
	 * After the URI regex parses, these characters cannot be literal in the host
	 * field, so any that appear after decoding came from percent-encoding and
	 * must be restored to prevent authority structure changes.
	 *
	 * @param {string} host
	 * @param {boolean} isIP - true for IPv4/IPv6 hosts (skip colon re-escaping)
	 * @returns {string}
	 */
	const HOST_DELIMS = { '@': '%40', '/': '%2F', '?': '%3F', '#': '%23', ':': '%3A' };
	const HOST_DELIM_RE = /[@/?#:]/g;
	const HOST_DELIM_NO_COLON_RE = /[@/?#]/g;

	function reescapeHostDelimiters (host, isIP) {
	  const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
	  re.lastIndex = 0;
	  return host.replace(re, (ch) => HOST_DELIMS[ch])
	}

	/**
	 * Normalizes percent escapes and optionally decodes only unreserved ASCII bytes.
	 * Reserved delimiters such as `%2F` and `%2E` stay escaped.
	 *
	 * @param {string} input
	 * @param {boolean} [decodeUnreserved=false]
	 * @returns {string}
	 */
	function normalizePercentEncoding (input, decodeUnreserved = false) {
	  if (input.indexOf('%') === -1) {
	    return input
	  }

	  let output = '';

	  for (let i = 0; i < input.length; i++) {
	    if (input[i] === '%' && i + 2 < input.length) {
	      const hex = input.slice(i + 1, i + 3);
	      if (isHexPair(hex)) {
	        const normalizedHex = hex.toUpperCase();
	        const decoded = String.fromCharCode(parseInt(normalizedHex, 16));

	        if (decodeUnreserved && isUnreserved(decoded)) {
	          output += decoded;
	        } else {
	          output += '%' + normalizedHex;
	        }

	        i += 2;
	        continue
	      }
	    }

	    output += input[i];
	  }

	  return output
	}

	/**
	 * Normalizes path data without turning reserved escapes into live path syntax.
	 * Valid escapes are uppercased, raw unsafe characters are escaped, and only
	 * unreserved bytes that are not `.` are decoded.
	 *
	 * @param {string} input
	 * @returns {string}
	 */
	function normalizePathEncoding (input) {
	  let output = '';

	  for (let i = 0; i < input.length; i++) {
	    if (input[i] === '%' && i + 2 < input.length) {
	      const hex = input.slice(i + 1, i + 3);
	      if (isHexPair(hex)) {
	        const normalizedHex = hex.toUpperCase();
	        const decoded = String.fromCharCode(parseInt(normalizedHex, 16));

	        if (decoded !== '.' && isUnreserved(decoded)) {
	          output += decoded;
	        } else {
	          output += '%' + normalizedHex;
	        }

	        i += 2;
	        continue
	      }
	    }

	    if (isPathCharacter(input[i])) {
	      output += input[i];
	    } else {
	      output += escape(input[i]);
	    }
	  }

	  return output
	}

	/**
	 * Escapes a component while preserving existing valid percent escapes.
	 *
	 * @param {string} input
	 * @returns {string}
	 */
	function escapePreservingEscapes (input) {
	  let output = '';

	  for (let i = 0; i < input.length; i++) {
	    if (input[i] === '%' && i + 2 < input.length) {
	      const hex = input.slice(i + 1, i + 3);
	      if (isHexPair(hex)) {
	        output += '%' + hex.toUpperCase();
	        i += 2;
	        continue
	      }
	    }

	    output += escape(input[i]);
	  }

	  return output
	}

	/**
	 * @param {import('../types/index').URIComponent} component
	 * @returns {string|undefined}
	 */
	function recomposeAuthority (component) {
	  const uriTokens = [];

	  if (component.userinfo !== undefined) {
	    uriTokens.push(component.userinfo);
	    uriTokens.push('@');
	  }

	  if (component.host !== undefined) {
	    let host = unescape(component.host);
	    if (!isIPv4(host)) {
	      const ipV6res = normalizeIPv6(host);
	      if (ipV6res.isIPV6 === true) {
	        host = `[${ipV6res.escapedHost}]`;
	      } else {
	        host = reescapeHostDelimiters(host, false);
	      }
	    }
	    uriTokens.push(host);
	  }

	  if (typeof component.port === 'number' || typeof component.port === 'string') {
	    uriTokens.push(':');
	    uriTokens.push(String(component.port));
	  }

	  return uriTokens.length ? uriTokens.join('') : undefined
	}
	utils = {
	  nonSimpleDomain,
	  recomposeAuthority,
	  reescapeHostDelimiters,
	  normalizePercentEncoding,
	  normalizePathEncoding,
	  escapePreservingEscapes,
	  removeDotSegments,
	  isIPv4,
	  isUUID,
	  normalizeIPv6,
	  stringArrayToHexStripped
	};
	return utils;
}

var schemes;
var hasRequiredSchemes;

function requireSchemes () {
	if (hasRequiredSchemes) return schemes;
	hasRequiredSchemes = 1;

	const { isUUID } = requireUtils();
	const URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;

	const supportedSchemeNames = /** @type {const} */ (['http', 'https', 'ws',
	  'wss', 'urn', 'urn:uuid']);

	/** @typedef {supportedSchemeNames[number]} SchemeName */

	/**
	 * @param {string} name
	 * @returns {name is SchemeName}
	 */
	function isValidSchemeName (name) {
	  return supportedSchemeNames.indexOf(/** @type {*} */ (name)) !== -1
	}

	/**
	 * @callback SchemeFn
	 * @param {import('../types/index').URIComponent} component
	 * @param {import('../types/index').Options} options
	 * @returns {import('../types/index').URIComponent}
	 */

	/**
	 * @typedef {Object} SchemeHandler
	 * @property {SchemeName} scheme - The scheme name.
	 * @property {boolean} [domainHost] - Indicates if the scheme supports domain hosts.
	 * @property {SchemeFn} parse - Function to parse the URI component for this scheme.
	 * @property {SchemeFn} serialize - Function to serialize the URI component for this scheme.
	 * @property {boolean} [skipNormalize] - Indicates if normalization should be skipped for this scheme.
	 * @property {boolean} [absolutePath] - Indicates if the scheme uses absolute paths.
	 * @property {boolean} [unicodeSupport] - Indicates if the scheme supports Unicode.
	 */

	/**
	 * @param {import('../types/index').URIComponent} wsComponent
	 * @returns {boolean}
	 */
	function wsIsSecure (wsComponent) {
	  if (wsComponent.secure === true) {
	    return true
	  } else if (wsComponent.secure === false) {
	    return false
	  } else if (wsComponent.scheme) {
	    return (
	      wsComponent.scheme.length === 3 &&
	      (wsComponent.scheme[0] === 'w' || wsComponent.scheme[0] === 'W') &&
	      (wsComponent.scheme[1] === 's' || wsComponent.scheme[1] === 'S') &&
	      (wsComponent.scheme[2] === 's' || wsComponent.scheme[2] === 'S')
	    )
	  } else {
	    return false
	  }
	}

	/** @type {SchemeFn} */
	function httpParse (component) {
	  if (!component.host) {
	    component.error = component.error || 'HTTP URIs must have a host.';
	  }

	  return component
	}

	/** @type {SchemeFn} */
	function httpSerialize (component) {
	  const secure = String(component.scheme).toLowerCase() === 'https';

	  // normalize the default port
	  if (component.port === (secure ? 443 : 80) || component.port === '') {
	    component.port = undefined;
	  }

	  // normalize the empty path
	  if (!component.path) {
	    component.path = '/';
	  }

	  // NOTE: We do not parse query strings for HTTP URIs
	  // as WWW Form Url Encoded query strings are part of the HTML4+ spec,
	  // and not the HTTP spec.

	  return component
	}

	/** @type {SchemeFn} */
	function wsParse (wsComponent) {
	// indicate if the secure flag is set
	  wsComponent.secure = wsIsSecure(wsComponent);

	  // construct resouce name
	  wsComponent.resourceName = (wsComponent.path || '/') + (wsComponent.query ? '?' + wsComponent.query : '');
	  wsComponent.path = undefined;
	  wsComponent.query = undefined;

	  return wsComponent
	}

	/** @type {SchemeFn} */
	function wsSerialize (wsComponent) {
	// normalize the default port
	  if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === '') {
	    wsComponent.port = undefined;
	  }

	  // ensure scheme matches secure flag
	  if (typeof wsComponent.secure === 'boolean') {
	    wsComponent.scheme = (wsComponent.secure ? 'wss' : 'ws');
	    wsComponent.secure = undefined;
	  }

	  // reconstruct path from resource name
	  if (wsComponent.resourceName) {
	    const [path, query] = wsComponent.resourceName.split('?');
	    wsComponent.path = (path && path !== '/' ? path : undefined);
	    wsComponent.query = query;
	    wsComponent.resourceName = undefined;
	  }

	  // forbid fragment component
	  wsComponent.fragment = undefined;

	  return wsComponent
	}

	/** @type {SchemeFn} */
	function urnParse (urnComponent, options) {
	  if (!urnComponent.path) {
	    urnComponent.error = 'URN can not be parsed';
	    return urnComponent
	  }
	  const matches = urnComponent.path.match(URN_REG);
	  if (matches) {
	    const scheme = options.scheme || urnComponent.scheme || 'urn';
	    urnComponent.nid = matches[1].toLowerCase();
	    urnComponent.nss = matches[2];
	    const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
	    const schemeHandler = getSchemeHandler(urnScheme);
	    urnComponent.path = undefined;

	    if (schemeHandler) {
	      urnComponent = schemeHandler.parse(urnComponent, options);
	    }
	  } else {
	    urnComponent.error = urnComponent.error || 'URN can not be parsed.';
	  }

	  return urnComponent
	}

	/** @type {SchemeFn} */
	function urnSerialize (urnComponent, options) {
	  if (urnComponent.nid === undefined) {
	    throw new Error('URN without nid cannot be serialized')
	  }
	  const scheme = options.scheme || urnComponent.scheme || 'urn';
	  const nid = urnComponent.nid.toLowerCase();
	  const urnScheme = `${scheme}:${options.nid || nid}`;
	  const schemeHandler = getSchemeHandler(urnScheme);

	  if (schemeHandler) {
	    urnComponent = schemeHandler.serialize(urnComponent, options);
	  }

	  const uriComponent = urnComponent;
	  const nss = urnComponent.nss;
	  uriComponent.path = `${nid || options.nid}:${nss}`;

	  options.skipEscape = true;
	  return uriComponent
	}

	/** @type {SchemeFn} */
	function urnuuidParse (urnComponent, options) {
	  const uuidComponent = urnComponent;
	  uuidComponent.uuid = uuidComponent.nss;
	  uuidComponent.nss = undefined;

	  if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
	    uuidComponent.error = uuidComponent.error || 'UUID is not valid.';
	  }

	  return uuidComponent
	}

	/** @type {SchemeFn} */
	function urnuuidSerialize (uuidComponent) {
	  const urnComponent = uuidComponent;
	  // normalize UUID
	  urnComponent.nss = (uuidComponent.uuid || '').toLowerCase();
	  return urnComponent
	}

	const http = /** @type {SchemeHandler} */ ({
	  scheme: 'http',
	  domainHost: true,
	  parse: httpParse,
	  serialize: httpSerialize
	});

	const https = /** @type {SchemeHandler} */ ({
	  scheme: 'https',
	  domainHost: http.domainHost,
	  parse: httpParse,
	  serialize: httpSerialize
	});

	const ws = /** @type {SchemeHandler} */ ({
	  scheme: 'ws',
	  domainHost: true,
	  parse: wsParse,
	  serialize: wsSerialize
	});

	const wss = /** @type {SchemeHandler} */ ({
	  scheme: 'wss',
	  domainHost: ws.domainHost,
	  parse: ws.parse,
	  serialize: ws.serialize
	});

	const urn = /** @type {SchemeHandler} */ ({
	  scheme: 'urn',
	  parse: urnParse,
	  serialize: urnSerialize,
	  skipNormalize: true
	});

	const urnuuid = /** @type {SchemeHandler} */ ({
	  scheme: 'urn:uuid',
	  parse: urnuuidParse,
	  serialize: urnuuidSerialize,
	  skipNormalize: true
	});

	const SCHEMES = /** @type {Record<SchemeName, SchemeHandler>} */ ({
	  http,
	  https,
	  ws,
	  wss,
	  urn,
	  'urn:uuid': urnuuid
	});

	Object.setPrototypeOf(SCHEMES, null);

	/**
	 * @param {string|undefined} scheme
	 * @returns {SchemeHandler|undefined}
	 */
	function getSchemeHandler (scheme) {
	  return (
	    scheme && (
	      SCHEMES[/** @type {SchemeName} */ (scheme)] ||
	      SCHEMES[/** @type {SchemeName} */(scheme.toLowerCase())])
	  ) ||
	    undefined
	}

	schemes = {
	  wsIsSecure,
	  SCHEMES,
	  isValidSchemeName,
	  getSchemeHandler,
	};
	return schemes;
}

var hasRequiredFastUri;

function requireFastUri () {
	if (hasRequiredFastUri) return fastUri.exports;
	hasRequiredFastUri = 1;

	const { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, escapePreservingEscapes, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = requireUtils();
	const { SCHEMES, getSchemeHandler } = requireSchemes();

	/**
	 * @template {import('./types/index').URIComponent|string} T
	 * @param {T} uri
	 * @param {import('./types/index').Options} [options]
	 * @returns {T}
	 */
	function normalize (uri, options) {
	  if (typeof uri === 'string') {
	    uri = /** @type {T} */ (normalizeString(uri, options));
	  } else if (typeof uri === 'object') {
	    uri = /** @type {T} */ (parse(serialize(uri, options), options));
	  }
	  return uri
	}

	/**
	 * @param {string} baseURI
	 * @param {string} relativeURI
	 * @param {import('./types/index').Options} [options]
	 * @returns {string}
	 */
	function resolve (baseURI, relativeURI, options) {
	  const schemelessOptions = options ? Object.assign({ scheme: 'null' }, options) : { scheme: 'null' };
	  const resolved = resolveComponent(parse(baseURI, schemelessOptions), parse(relativeURI, schemelessOptions), schemelessOptions, true);
	  schemelessOptions.skipEscape = true;
	  return serialize(resolved, schemelessOptions)
	}

	/**
	 * @param {import ('./types/index').URIComponent} base
	 * @param {import ('./types/index').URIComponent} relative
	 * @param {import('./types/index').Options} [options]
	 * @param {boolean} [skipNormalization=false]
	 * @returns {import ('./types/index').URIComponent}
	 */
	function resolveComponent (base, relative, options, skipNormalization) {
	  /** @type {import('./types/index').URIComponent} */
	  const target = {};
	  if (!skipNormalization) {
	    base = parse(serialize(base, options), options); // normalize base component
	    relative = parse(serialize(relative, options), options); // normalize relative component
	  }
	  options = options || {};

	  if (!options.tolerant && relative.scheme) {
	    target.scheme = relative.scheme;
	    // target.authority = relative.authority;
	    target.userinfo = relative.userinfo;
	    target.host = relative.host;
	    target.port = relative.port;
	    target.path = removeDotSegments(relative.path || '');
	    target.query = relative.query;
	  } else {
	    if (relative.userinfo !== undefined || relative.host !== undefined || relative.port !== undefined) {
	      // target.authority = relative.authority;
	      target.userinfo = relative.userinfo;
	      target.host = relative.host;
	      target.port = relative.port;
	      target.path = removeDotSegments(relative.path || '');
	      target.query = relative.query;
	    } else {
	      if (!relative.path) {
	        target.path = base.path;
	        if (relative.query !== undefined) {
	          target.query = relative.query;
	        } else {
	          target.query = base.query;
	        }
	      } else {
	        if (relative.path[0] === '/') {
	          target.path = removeDotSegments(relative.path);
	        } else {
	          if ((base.userinfo !== undefined || base.host !== undefined || base.port !== undefined) && !base.path) {
	            target.path = '/' + relative.path;
	          } else if (!base.path) {
	            target.path = relative.path;
	          } else {
	            target.path = base.path.slice(0, base.path.lastIndexOf('/') + 1) + relative.path;
	          }
	          target.path = removeDotSegments(target.path);
	        }
	        target.query = relative.query;
	      }
	      // target.authority = base.authority;
	      target.userinfo = base.userinfo;
	      target.host = base.host;
	      target.port = base.port;
	    }
	    target.scheme = base.scheme;
	  }

	  target.fragment = relative.fragment;

	  return target
	}

	/**
	 * @param {import ('./types/index').URIComponent|string} uriA
	 * @param {import ('./types/index').URIComponent|string} uriB
	 * @param {import ('./types/index').Options} options
	 * @returns {boolean}
	 */
	function equal (uriA, uriB, options) {
	  const normalizedA = normalizeComparableURI(uriA, options);
	  const normalizedB = normalizeComparableURI(uriB, options);

	  return normalizedA !== undefined && normalizedB !== undefined && normalizedA.toLowerCase() === normalizedB.toLowerCase()
	}

	/**
	 * @param {Readonly<import('./types/index').URIComponent>} cmpts
	 * @param {import('./types/index').Options} [opts]
	 * @returns {string}
	 */
	function serialize (cmpts, opts) {
	  const component = {
	    host: cmpts.host,
	    scheme: cmpts.scheme,
	    userinfo: cmpts.userinfo,
	    port: cmpts.port,
	    path: cmpts.path,
	    query: cmpts.query,
	    nid: cmpts.nid,
	    nss: cmpts.nss,
	    uuid: cmpts.uuid,
	    fragment: cmpts.fragment,
	    reference: cmpts.reference,
	    resourceName: cmpts.resourceName,
	    secure: cmpts.secure,
	    error: ''
	  };
	  const options = Object.assign({}, opts);
	  const uriTokens = [];

	  // find scheme handler
	  const schemeHandler = getSchemeHandler(options.scheme || component.scheme);

	  // perform scheme specific serialization
	  if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);

	  if (component.path !== undefined) {
	    if (!options.skipEscape) {
	      component.path = escapePreservingEscapes(component.path);

	      if (component.scheme !== undefined) {
	        component.path = component.path.split('%3A').join(':');
	      }
	    } else {
	      component.path = normalizePercentEncoding(component.path);
	    }
	  }

	  if (options.reference !== 'suffix' && component.scheme) {
	    uriTokens.push(component.scheme, ':');
	  }

	  const authority = recomposeAuthority(component);
	  if (authority !== undefined) {
	    if (options.reference !== 'suffix') {
	      uriTokens.push('//');
	    }

	    uriTokens.push(authority);

	    if (component.path && component.path[0] !== '/') {
	      uriTokens.push('/');
	    }
	  }
	  if (component.path !== undefined) {
	    let s = component.path;

	    if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
	      s = removeDotSegments(s);
	    }

	    if (
	      authority === undefined &&
	      s[0] === '/' &&
	      s[1] === '/'
	    ) {
	      // don't allow the path to start with "//"
	      s = '/%2F' + s.slice(2);
	    }

	    uriTokens.push(s);
	  }

	  if (component.query !== undefined) {
	    uriTokens.push('?', component.query);
	  }

	  if (component.fragment !== undefined) {
	    uriTokens.push('#', component.fragment);
	  }
	  return uriTokens.join('')
	}

	const URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;

	/**
	 * @param {import('./types/index').URIComponent} parsed
	 * @param {RegExpMatchArray} matches
	 * @returns {string|undefined}
	 */
	function getParseError (parsed, matches) {
	  if (matches[2] !== undefined && parsed.path && parsed.path[0] !== '/') {
	    return 'URI path must start with "/" when authority is present.'
	  }

	  if (typeof parsed.port === 'number' && (parsed.port < 0 || parsed.port > 65535)) {
	    return 'URI port is malformed.'
	  }

	  return undefined
	}

	/**
	 * @param {string} uri
	 * @param {import('./types/index').Options} [opts]
	 * @returns {{ parsed: import('./types/index').URIComponent, malformedAuthorityOrPort: boolean }}
	 */
	function parseWithStatus (uri, opts) {
	  const options = Object.assign({}, opts);
	  /** @type {import('./types/index').URIComponent} */
	  const parsed = {
	    scheme: undefined,
	    userinfo: undefined,
	    host: '',
	    port: undefined,
	    path: '',
	    query: undefined,
	    fragment: undefined
	  };

	  let malformedAuthorityOrPort = false;

	  let isIP = false;
	  if (options.reference === 'suffix') {
	    if (options.scheme) {
	      uri = options.scheme + ':' + uri;
	    } else {
	      uri = '//' + uri;
	    }
	  }

	  const matches = uri.match(URI_PARSE);

	  if (matches) {
	    // store each component
	    parsed.scheme = matches[1];
	    parsed.userinfo = matches[3];
	    parsed.host = matches[4];
	    parsed.port = parseInt(matches[5], 10);
	    parsed.path = matches[6] || '';
	    parsed.query = matches[7];
	    parsed.fragment = matches[8];

	    // fix port number
	    if (isNaN(parsed.port)) {
	      parsed.port = matches[5];
	    }

	    const parseError = getParseError(parsed, matches);
	    if (parseError !== undefined) {
	      parsed.error = parsed.error || parseError;
	      malformedAuthorityOrPort = true;
	    }

	    if (parsed.host) {
	      const ipv4result = isIPv4(parsed.host);
	      if (ipv4result === false) {
	        const ipv6result = normalizeIPv6(parsed.host);
	        parsed.host = ipv6result.host.toLowerCase();
	        isIP = ipv6result.isIPV6;
	      } else {
	        isIP = true;
	      }
	    }
	    if (parsed.scheme === undefined && parsed.userinfo === undefined && parsed.host === undefined && parsed.port === undefined && parsed.query === undefined && !parsed.path) {
	      parsed.reference = 'same-document';
	    } else if (parsed.scheme === undefined) {
	      parsed.reference = 'relative';
	    } else if (parsed.fragment === undefined) {
	      parsed.reference = 'absolute';
	    } else {
	      parsed.reference = 'uri';
	    }

	    // check for reference errors
	    if (options.reference && options.reference !== 'suffix' && options.reference !== parsed.reference) {
	      parsed.error = parsed.error || 'URI is not a ' + options.reference + ' reference.';
	    }

	    // find scheme handler
	    const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);

	    // check if scheme can't handle IRIs
	    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
	      // if host component is a domain name
	      if (parsed.host && (options.domainHost || (schemeHandler && schemeHandler.domainHost)) && isIP === false && nonSimpleDomain(parsed.host)) {
	        // convert Unicode IDN -> ASCII IDN
	        try {
	          parsed.host = new URL('http://' + parsed.host).hostname;
	        } catch (e) {
	          parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
	        }
	      }
	      // convert IRI -> URI
	    }

	    if (!schemeHandler || (schemeHandler && !schemeHandler.skipNormalize)) {
	      if (uri.indexOf('%') !== -1) {
	        if (parsed.scheme !== undefined) {
	          parsed.scheme = unescape(parsed.scheme);
	        }
	        if (parsed.host !== undefined) {
	          parsed.host = reescapeHostDelimiters(unescape(parsed.host), isIP);
	        }
	      }
	      if (parsed.path) {
	        parsed.path = normalizePathEncoding(parsed.path);
	      }
	      if (parsed.fragment) {
	        try {
	          parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
	        } catch {
	          parsed.error = parsed.error || 'URI malformed';
	        }
	      }
	    }

	    // perform scheme specific parsing
	    if (schemeHandler && schemeHandler.parse) {
	      schemeHandler.parse(parsed, options);
	    }
	  } else {
	    parsed.error = parsed.error || 'URI can not be parsed.';
	  }
	  return { parsed, malformedAuthorityOrPort }
	}

	/**
	 * @param {string} uri
	 * @param {import('./types/index').Options} [opts]
	 * @returns
	 */
	function parse (uri, opts) {
	  return parseWithStatus(uri, opts).parsed
	}

	/**
	 * @param {string} uri
	 * @param {import('./types/index').Options} [opts]
	 * @returns {string}
	 */
	function normalizeString (uri, opts) {
	  return normalizeStringWithStatus(uri, opts).normalized
	}

	/**
	 * @param {string} uri
	 * @param {import('./types/index').Options} [opts]
	 * @returns {{ normalized: string, malformedAuthorityOrPort: boolean }}
	 */
	function normalizeStringWithStatus (uri, opts) {
	  const { parsed, malformedAuthorityOrPort } = parseWithStatus(uri, opts);
	  return {
	    normalized: malformedAuthorityOrPort ? uri : serialize(parsed, opts),
	    malformedAuthorityOrPort
	  }
	}

	/**
	 * @param {import ('./types/index').URIComponent|string} uri
	 * @param {import('./types/index').Options} [opts]
	 * @returns {string|undefined}
	 */
	function normalizeComparableURI (uri, opts) {
	  if (typeof uri === 'string') {
	    const { normalized, malformedAuthorityOrPort } = normalizeStringWithStatus(uri, opts);
	    return malformedAuthorityOrPort ? undefined : normalized
	  }

	  if (typeof uri === 'object') {
	    return serialize(uri, opts)
	  }
	}

	const fastUri$1 = {
	  SCHEMES,
	  normalize,
	  resolve,
	  resolveComponent,
	  equal,
	  serialize,
	  parse
	};

	fastUri.exports = fastUri$1;
	fastUri.exports.default = fastUri$1;
	fastUri.exports.fastUri = fastUri$1;
	return fastUri.exports;
}

var hasRequiredUri;

function requireUri () {
	if (hasRequiredUri) return uri;
	hasRequiredUri = 1;
	Object.defineProperty(uri, "__esModule", { value: true });
	const uri$1 = requireFastUri();
	uri$1.code = 'require("ajv/dist/runtime/uri").default';
	uri.default = uri$1;
	
	return uri;
}

var hasRequiredCore$1;

function requireCore$1 () {
	if (hasRequiredCore$1) return core$1;
	hasRequiredCore$1 = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = void 0;
		var validate_1 = requireValidate();
		Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function () { return validate_1.KeywordCxt; } });
		var codegen_1 = requireCodegen();
		Object.defineProperty(exports, "_", { enumerable: true, get: function () { return codegen_1._; } });
		Object.defineProperty(exports, "str", { enumerable: true, get: function () { return codegen_1.str; } });
		Object.defineProperty(exports, "stringify", { enumerable: true, get: function () { return codegen_1.stringify; } });
		Object.defineProperty(exports, "nil", { enumerable: true, get: function () { return codegen_1.nil; } });
		Object.defineProperty(exports, "Name", { enumerable: true, get: function () { return codegen_1.Name; } });
		Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function () { return codegen_1.CodeGen; } });
		const validation_error_1 = requireValidation_error();
		const ref_error_1 = requireRef_error();
		const rules_1 = requireRules();
		const compile_1 = requireCompile();
		const codegen_2 = requireCodegen();
		const resolve_1 = requireResolve();
		const dataType_1 = requireDataType();
		const util_1 = requireUtil();
		const $dataRefSchema = require$$9;
		const uri_1 = requireUri();
		const defaultRegExp = (str, flags) => new RegExp(str, flags);
		defaultRegExp.code = "new RegExp";
		const META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
		const EXT_SCOPE_NAMES = new Set([
		    "validate",
		    "serialize",
		    "parse",
		    "wrapper",
		    "root",
		    "schema",
		    "keyword",
		    "pattern",
		    "formats",
		    "validate$data",
		    "func",
		    "obj",
		    "Error",
		]);
		const removedOptions = {
		    errorDataPath: "",
		    format: "`validateFormats: false` can be used instead.",
		    nullable: '"nullable" keyword is supported by default.',
		    jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
		    extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
		    missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
		    processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
		    sourceCode: "Use option `code: {source: true}`",
		    strictDefaults: "It is default now, see option `strict`.",
		    strictKeywords: "It is default now, see option `strict`.",
		    uniqueItems: '"uniqueItems" keyword is always validated.',
		    unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
		    cache: "Map is used as cache, schema object as key.",
		    serialize: "Map is used as cache, schema object as key.",
		    ajvErrors: "It is default now.",
		};
		const deprecatedOptions = {
		    ignoreKeywordsWithRef: "",
		    jsPropertySyntax: "",
		    unicode: '"minLength"/"maxLength" account for unicode characters by default.',
		};
		const MAX_EXPRESSION = 200;
		// eslint-disable-next-line complexity
		function requiredOptions(o) {
		    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
		    const s = o.strict;
		    const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
		    const optimize = _optz === true || _optz === undefined ? 1 : _optz || 0;
		    const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
		    const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
		    return {
		        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
		        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
		        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
		        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
		        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
		        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
		        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
		        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
		        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
		        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
		        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
		        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
		        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
		        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
		        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
		        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
		        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
		        uriResolver: uriResolver,
		    };
		}
		class Ajv {
		    constructor(opts = {}) {
		        this.schemas = {};
		        this.refs = {};
		        this.formats = {};
		        this._compilations = new Set();
		        this._loading = {};
		        this._cache = new Map();
		        opts = this.opts = { ...opts, ...requiredOptions(opts) };
		        const { es5, lines } = this.opts.code;
		        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
		        this.logger = getLogger(opts.logger);
		        const formatOpt = opts.validateFormats;
		        opts.validateFormats = false;
		        this.RULES = (0, rules_1.getRules)();
		        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
		        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
		        this._metaOpts = getMetaSchemaOptions.call(this);
		        if (opts.formats)
		            addInitialFormats.call(this);
		        this._addVocabularies();
		        this._addDefaultMetaSchema();
		        if (opts.keywords)
		            addInitialKeywords.call(this, opts.keywords);
		        if (typeof opts.meta == "object")
		            this.addMetaSchema(opts.meta);
		        addInitialSchemas.call(this);
		        opts.validateFormats = formatOpt;
		    }
		    _addVocabularies() {
		        this.addKeyword("$async");
		    }
		    _addDefaultMetaSchema() {
		        const { $data, meta, schemaId } = this.opts;
		        let _dataRefSchema = $dataRefSchema;
		        if (schemaId === "id") {
		            _dataRefSchema = { ...$dataRefSchema };
		            _dataRefSchema.id = _dataRefSchema.$id;
		            delete _dataRefSchema.$id;
		        }
		        if (meta && $data)
		            this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
		    }
		    defaultMeta() {
		        const { meta, schemaId } = this.opts;
		        return (this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : undefined);
		    }
		    validate(schemaKeyRef, // key, ref or schema object
		    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
		    data // to be validated
		    ) {
		        let v;
		        if (typeof schemaKeyRef == "string") {
		            v = this.getSchema(schemaKeyRef);
		            if (!v)
		                throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
		        }
		        else {
		            v = this.compile(schemaKeyRef);
		        }
		        const valid = v(data);
		        if (!("$async" in v))
		            this.errors = v.errors;
		        return valid;
		    }
		    compile(schema, _meta) {
		        const sch = this._addSchema(schema, _meta);
		        return (sch.validate || this._compileSchemaEnv(sch));
		    }
		    compileAsync(schema, meta) {
		        if (typeof this.opts.loadSchema != "function") {
		            throw new Error("options.loadSchema should be a function");
		        }
		        const { loadSchema } = this.opts;
		        return runCompileAsync.call(this, schema, meta);
		        async function runCompileAsync(_schema, _meta) {
		            await loadMetaSchema.call(this, _schema.$schema);
		            const sch = this._addSchema(_schema, _meta);
		            return sch.validate || _compileAsync.call(this, sch);
		        }
		        async function loadMetaSchema($ref) {
		            if ($ref && !this.getSchema($ref)) {
		                await runCompileAsync.call(this, { $ref }, true);
		            }
		        }
		        async function _compileAsync(sch) {
		            try {
		                return this._compileSchemaEnv(sch);
		            }
		            catch (e) {
		                if (!(e instanceof ref_error_1.default))
		                    throw e;
		                checkLoaded.call(this, e);
		                await loadMissingSchema.call(this, e.missingSchema);
		                return _compileAsync.call(this, sch);
		            }
		        }
		        function checkLoaded({ missingSchema: ref, missingRef }) {
		            if (this.refs[ref]) {
		                throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
		            }
		        }
		        async function loadMissingSchema(ref) {
		            const _schema = await _loadSchema.call(this, ref);
		            if (!this.refs[ref])
		                await loadMetaSchema.call(this, _schema.$schema);
		            if (!this.refs[ref])
		                this.addSchema(_schema, ref, meta);
		        }
		        async function _loadSchema(ref) {
		            const p = this._loading[ref];
		            if (p)
		                return p;
		            try {
		                return await (this._loading[ref] = loadSchema(ref));
		            }
		            finally {
		                delete this._loading[ref];
		            }
		        }
		    }
		    // Adds schema to the instance
		    addSchema(schema, // If array is passed, `key` will be ignored
		    key, // Optional schema key. Can be passed to `validate` method instead of schema object or id/ref. One schema per instance can have empty `id` and `key`.
		    _meta, // true if schema is a meta-schema. Used internally, addMetaSchema should be used instead.
		    _validateSchema = this.opts.validateSchema // false to skip schema validation. Used internally, option validateSchema should be used instead.
		    ) {
		        if (Array.isArray(schema)) {
		            for (const sch of schema)
		                this.addSchema(sch, undefined, _meta, _validateSchema);
		            return this;
		        }
		        let id;
		        if (typeof schema === "object") {
		            const { schemaId } = this.opts;
		            id = schema[schemaId];
		            if (id !== undefined && typeof id != "string") {
		                throw new Error(`schema ${schemaId} must be string`);
		            }
		        }
		        key = (0, resolve_1.normalizeId)(key || id);
		        this._checkUnique(key);
		        this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
		        return this;
		    }
		    // Add schema that will be used to validate other schemas
		    // options in META_IGNORE_OPTIONS are alway set to false
		    addMetaSchema(schema, key, // schema key
		    _validateSchema = this.opts.validateSchema // false to skip schema validation, can be used to override validateSchema option for meta-schema
		    ) {
		        this.addSchema(schema, key, true, _validateSchema);
		        return this;
		    }
		    //  Validate schema against its meta-schema
		    validateSchema(schema, throwOrLogError) {
		        if (typeof schema == "boolean")
		            return true;
		        let $schema;
		        $schema = schema.$schema;
		        if ($schema !== undefined && typeof $schema != "string") {
		            throw new Error("$schema must be a string");
		        }
		        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
		        if (!$schema) {
		            this.logger.warn("meta-schema not available");
		            this.errors = null;
		            return true;
		        }
		        const valid = this.validate($schema, schema);
		        if (!valid && throwOrLogError) {
		            const message = "schema is invalid: " + this.errorsText();
		            if (this.opts.validateSchema === "log")
		                this.logger.error(message);
		            else
		                throw new Error(message);
		        }
		        return valid;
		    }
		    // Get compiled schema by `key` or `ref`.
		    // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
		    getSchema(keyRef) {
		        let sch;
		        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
		            keyRef = sch;
		        if (sch === undefined) {
		            const { schemaId } = this.opts;
		            const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
		            sch = compile_1.resolveSchema.call(this, root, keyRef);
		            if (!sch)
		                return;
		            this.refs[keyRef] = sch;
		        }
		        return (sch.validate || this._compileSchemaEnv(sch));
		    }
		    // Remove cached schema(s).
		    // If no parameter is passed all schemas but meta-schemas are removed.
		    // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
		    // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
		    removeSchema(schemaKeyRef) {
		        if (schemaKeyRef instanceof RegExp) {
		            this._removeAllSchemas(this.schemas, schemaKeyRef);
		            this._removeAllSchemas(this.refs, schemaKeyRef);
		            return this;
		        }
		        switch (typeof schemaKeyRef) {
		            case "undefined":
		                this._removeAllSchemas(this.schemas);
		                this._removeAllSchemas(this.refs);
		                this._cache.clear();
		                return this;
		            case "string": {
		                const sch = getSchEnv.call(this, schemaKeyRef);
		                if (typeof sch == "object")
		                    this._cache.delete(sch.schema);
		                delete this.schemas[schemaKeyRef];
		                delete this.refs[schemaKeyRef];
		                return this;
		            }
		            case "object": {
		                const cacheKey = schemaKeyRef;
		                this._cache.delete(cacheKey);
		                let id = schemaKeyRef[this.opts.schemaId];
		                if (id) {
		                    id = (0, resolve_1.normalizeId)(id);
		                    delete this.schemas[id];
		                    delete this.refs[id];
		                }
		                return this;
		            }
		            default:
		                throw new Error("ajv.removeSchema: invalid parameter");
		        }
		    }
		    // add "vocabulary" - a collection of keywords
		    addVocabulary(definitions) {
		        for (const def of definitions)
		            this.addKeyword(def);
		        return this;
		    }
		    addKeyword(kwdOrDef, def // deprecated
		    ) {
		        let keyword;
		        if (typeof kwdOrDef == "string") {
		            keyword = kwdOrDef;
		            if (typeof def == "object") {
		                this.logger.warn("these parameters are deprecated, see docs for addKeyword");
		                def.keyword = keyword;
		            }
		        }
		        else if (typeof kwdOrDef == "object" && def === undefined) {
		            def = kwdOrDef;
		            keyword = def.keyword;
		            if (Array.isArray(keyword) && !keyword.length) {
		                throw new Error("addKeywords: keyword must be string or non-empty array");
		            }
		        }
		        else {
		            throw new Error("invalid addKeywords parameters");
		        }
		        checkKeyword.call(this, keyword, def);
		        if (!def) {
		            (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
		            return this;
		        }
		        keywordMetaschema.call(this, def);
		        const definition = {
		            ...def,
		            type: (0, dataType_1.getJSONTypes)(def.type),
		            schemaType: (0, dataType_1.getJSONTypes)(def.schemaType),
		        };
		        (0, util_1.eachItem)(keyword, definition.type.length === 0
		            ? (k) => addRule.call(this, k, definition)
		            : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
		        return this;
		    }
		    getKeyword(keyword) {
		        const rule = this.RULES.all[keyword];
		        return typeof rule == "object" ? rule.definition : !!rule;
		    }
		    // Remove keyword
		    removeKeyword(keyword) {
		        // TODO return type should be Ajv
		        const { RULES } = this;
		        delete RULES.keywords[keyword];
		        delete RULES.all[keyword];
		        for (const group of RULES.rules) {
		            const i = group.rules.findIndex((rule) => rule.keyword === keyword);
		            if (i >= 0)
		                group.rules.splice(i, 1);
		        }
		        return this;
		    }
		    // Add format
		    addFormat(name, format) {
		        if (typeof format == "string")
		            format = new RegExp(format);
		        this.formats[name] = format;
		        return this;
		    }
		    errorsText(errors = this.errors, // optional array of validation errors
		    { separator = ", ", dataVar = "data" } = {} // optional options with properties `separator` and `dataVar`
		    ) {
		        if (!errors || errors.length === 0)
		            return "No errors";
		        return errors
		            .map((e) => `${dataVar}${e.instancePath} ${e.message}`)
		            .reduce((text, msg) => text + separator + msg);
		    }
		    $dataMetaSchema(metaSchema, keywordsJsonPointers) {
		        const rules = this.RULES.all;
		        metaSchema = JSON.parse(JSON.stringify(metaSchema));
		        for (const jsonPointer of keywordsJsonPointers) {
		            const segments = jsonPointer.split("/").slice(1); // first segment is an empty string
		            let keywords = metaSchema;
		            for (const seg of segments)
		                keywords = keywords[seg];
		            for (const key in rules) {
		                const rule = rules[key];
		                if (typeof rule != "object")
		                    continue;
		                const { $data } = rule.definition;
		                const schema = keywords[key];
		                if ($data && schema)
		                    keywords[key] = schemaOrData(schema);
		            }
		        }
		        return metaSchema;
		    }
		    _removeAllSchemas(schemas, regex) {
		        for (const keyRef in schemas) {
		            const sch = schemas[keyRef];
		            if (!regex || regex.test(keyRef)) {
		                if (typeof sch == "string") {
		                    delete schemas[keyRef];
		                }
		                else if (sch && !sch.meta) {
		                    this._cache.delete(sch.schema);
		                    delete schemas[keyRef];
		                }
		            }
		        }
		    }
		    _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
		        let id;
		        const { schemaId } = this.opts;
		        if (typeof schema == "object") {
		            id = schema[schemaId];
		        }
		        else {
		            if (this.opts.jtd)
		                throw new Error("schema must be object");
		            else if (typeof schema != "boolean")
		                throw new Error("schema must be object or boolean");
		        }
		        let sch = this._cache.get(schema);
		        if (sch !== undefined)
		            return sch;
		        baseId = (0, resolve_1.normalizeId)(id || baseId);
		        const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
		        sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
		        this._cache.set(sch.schema, sch);
		        if (addSchema && !baseId.startsWith("#")) {
		            // TODO atm it is allowed to overwrite schemas without id (instead of not adding them)
		            if (baseId)
		                this._checkUnique(baseId);
		            this.refs[baseId] = sch;
		        }
		        if (validateSchema)
		            this.validateSchema(schema, true);
		        return sch;
		    }
		    _checkUnique(id) {
		        if (this.schemas[id] || this.refs[id]) {
		            throw new Error(`schema with key or id "${id}" already exists`);
		        }
		    }
		    _compileSchemaEnv(sch) {
		        if (sch.meta)
		            this._compileMetaSchema(sch);
		        else
		            compile_1.compileSchema.call(this, sch);
		        /* istanbul ignore if */
		        if (!sch.validate)
		            throw new Error("ajv implementation error");
		        return sch.validate;
		    }
		    _compileMetaSchema(sch) {
		        const currentOpts = this.opts;
		        this.opts = this._metaOpts;
		        try {
		            compile_1.compileSchema.call(this, sch);
		        }
		        finally {
		            this.opts = currentOpts;
		        }
		    }
		}
		Ajv.ValidationError = validation_error_1.default;
		Ajv.MissingRefError = ref_error_1.default;
		exports.default = Ajv;
		function checkOptions(checkOpts, options, msg, log = "error") {
		    for (const key in checkOpts) {
		        const opt = key;
		        if (opt in options)
		            this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
		    }
		}
		function getSchEnv(keyRef) {
		    keyRef = (0, resolve_1.normalizeId)(keyRef); // TODO tests fail without this line
		    return this.schemas[keyRef] || this.refs[keyRef];
		}
		function addInitialSchemas() {
		    const optsSchemas = this.opts.schemas;
		    if (!optsSchemas)
		        return;
		    if (Array.isArray(optsSchemas))
		        this.addSchema(optsSchemas);
		    else
		        for (const key in optsSchemas)
		            this.addSchema(optsSchemas[key], key);
		}
		function addInitialFormats() {
		    for (const name in this.opts.formats) {
		        const format = this.opts.formats[name];
		        if (format)
		            this.addFormat(name, format);
		    }
		}
		function addInitialKeywords(defs) {
		    if (Array.isArray(defs)) {
		        this.addVocabulary(defs);
		        return;
		    }
		    this.logger.warn("keywords option as map is deprecated, pass array");
		    for (const keyword in defs) {
		        const def = defs[keyword];
		        if (!def.keyword)
		            def.keyword = keyword;
		        this.addKeyword(def);
		    }
		}
		function getMetaSchemaOptions() {
		    const metaOpts = { ...this.opts };
		    for (const opt of META_IGNORE_OPTIONS)
		        delete metaOpts[opt];
		    return metaOpts;
		}
		const noLogs = { log() { }, warn() { }, error() { } };
		function getLogger(logger) {
		    if (logger === false)
		        return noLogs;
		    if (logger === undefined)
		        return console;
		    if (logger.log && logger.warn && logger.error)
		        return logger;
		    throw new Error("logger must implement log, warn and error methods");
		}
		const KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
		function checkKeyword(keyword, def) {
		    const { RULES } = this;
		    (0, util_1.eachItem)(keyword, (kwd) => {
		        if (RULES.keywords[kwd])
		            throw new Error(`Keyword ${kwd} is already defined`);
		        if (!KEYWORD_NAME.test(kwd))
		            throw new Error(`Keyword ${kwd} has invalid name`);
		    });
		    if (!def)
		        return;
		    if (def.$data && !("code" in def || "validate" in def)) {
		        throw new Error('$data keyword must have "code" or "validate" function');
		    }
		}
		function addRule(keyword, definition, dataType) {
		    var _a;
		    const post = definition === null || definition === void 0 ? void 0 : definition.post;
		    if (dataType && post)
		        throw new Error('keyword with "post" flag cannot have "type"');
		    const { RULES } = this;
		    let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
		    if (!ruleGroup) {
		        ruleGroup = { type: dataType, rules: [] };
		        RULES.rules.push(ruleGroup);
		    }
		    RULES.keywords[keyword] = true;
		    if (!definition)
		        return;
		    const rule = {
		        keyword,
		        definition: {
		            ...definition,
		            type: (0, dataType_1.getJSONTypes)(definition.type),
		            schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType),
		        },
		    };
		    if (definition.before)
		        addBeforeRule.call(this, ruleGroup, rule, definition.before);
		    else
		        ruleGroup.rules.push(rule);
		    RULES.all[keyword] = rule;
		    (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
		}
		function addBeforeRule(ruleGroup, rule, before) {
		    const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
		    if (i >= 0) {
		        ruleGroup.rules.splice(i, 0, rule);
		    }
		    else {
		        ruleGroup.rules.push(rule);
		        this.logger.warn(`rule ${before} is not defined`);
		    }
		}
		function keywordMetaschema(def) {
		    let { metaSchema } = def;
		    if (metaSchema === undefined)
		        return;
		    if (def.$data && this.opts.$data)
		        metaSchema = schemaOrData(metaSchema);
		    def.validateSchema = this.compile(metaSchema, true);
		}
		const $dataRef = {
		    $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
		};
		function schemaOrData(schema) {
		    return { anyOf: [schema, $dataRef] };
		}
		
	} (core$1));
	return core$1;
}

var draft2020 = {};

var core = {};

var id = {};

var hasRequiredId;

function requireId () {
	if (hasRequiredId) return id;
	hasRequiredId = 1;
	Object.defineProperty(id, "__esModule", { value: true });
	const def = {
	    keyword: "id",
	    code() {
	        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
	    },
	};
	id.default = def;
	
	return id;
}

var ref = {};

var hasRequiredRef;

function requireRef () {
	if (hasRequiredRef) return ref;
	hasRequiredRef = 1;
	Object.defineProperty(ref, "__esModule", { value: true });
	ref.callRef = ref.getValidate = void 0;
	const ref_error_1 = requireRef_error();
	const code_1 = requireCode();
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const compile_1 = requireCompile();
	const util_1 = requireUtil();
	const def = {
	    keyword: "$ref",
	    schemaType: "string",
	    code(cxt) {
	        const { gen, schema: $ref, it } = cxt;
	        const { baseId, schemaEnv: env, validateName, opts, self } = it;
	        const { root } = env;
	        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
	            return callRootRef();
	        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
	        if (schOrEnv === undefined)
	            throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
	        if (schOrEnv instanceof compile_1.SchemaEnv)
	            return callValidate(schOrEnv);
	        return inlineRefSchema(schOrEnv);
	        function callRootRef() {
	            if (env === root)
	                return callRef(cxt, validateName, env, env.$async);
	            const rootName = gen.scopeValue("root", { ref: root });
	            return callRef(cxt, (0, codegen_1._) `${rootName}.validate`, root, root.$async);
	        }
	        function callValidate(sch) {
	            const v = getValidate(cxt, sch);
	            callRef(cxt, v, sch, sch.$async);
	        }
	        function inlineRefSchema(sch) {
	            const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
	            const valid = gen.name("valid");
	            const schCxt = cxt.subschema({
	                schema: sch,
	                dataTypes: [],
	                schemaPath: codegen_1.nil,
	                topSchemaRef: schName,
	                errSchemaPath: $ref,
	            }, valid);
	            cxt.mergeEvaluated(schCxt);
	            cxt.ok(valid);
	        }
	    },
	};
	function getValidate(cxt, sch) {
	    const { gen } = cxt;
	    return sch.validate
	        ? gen.scopeValue("validate", { ref: sch.validate })
	        : (0, codegen_1._) `${gen.scopeValue("wrapper", { ref: sch })}.validate`;
	}
	ref.getValidate = getValidate;
	function callRef(cxt, v, sch, $async) {
	    const { gen, it } = cxt;
	    const { allErrors, schemaEnv: env, opts } = it;
	    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
	    if ($async)
	        callAsyncRef();
	    else
	        callSyncRef();
	    function callAsyncRef() {
	        if (!env.$async)
	            throw new Error("async schema referenced by sync schema");
	        const valid = gen.let("valid");
	        gen.try(() => {
	            gen.code((0, codegen_1._) `await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
	            addEvaluatedFrom(v); // TODO will not work with async, it has to be returned with the result
	            if (!allErrors)
	                gen.assign(valid, true);
	        }, (e) => {
	            gen.if((0, codegen_1._) `!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
	            addErrorsFrom(e);
	            if (!allErrors)
	                gen.assign(valid, false);
	        });
	        cxt.ok(valid);
	    }
	    function callSyncRef() {
	        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
	    }
	    function addErrorsFrom(source) {
	        const errs = (0, codegen_1._) `${source}.errors`;
	        gen.assign(names_1.default.vErrors, (0, codegen_1._) `${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`); // TODO tagged
	        gen.assign(names_1.default.errors, (0, codegen_1._) `${names_1.default.vErrors}.length`);
	    }
	    function addEvaluatedFrom(source) {
	        var _a;
	        if (!it.opts.unevaluated)
	            return;
	        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
	        // TODO refactor
	        if (it.props !== true) {
	            if (schEvaluated && !schEvaluated.dynamicProps) {
	                if (schEvaluated.props !== undefined) {
	                    it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
	                }
	            }
	            else {
	                const props = gen.var("props", (0, codegen_1._) `${source}.evaluated.props`);
	                it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
	            }
	        }
	        if (it.items !== true) {
	            if (schEvaluated && !schEvaluated.dynamicItems) {
	                if (schEvaluated.items !== undefined) {
	                    it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
	                }
	            }
	            else {
	                const items = gen.var("items", (0, codegen_1._) `${source}.evaluated.items`);
	                it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
	            }
	        }
	    }
	}
	ref.callRef = callRef;
	ref.default = def;
	
	return ref;
}

var hasRequiredCore;

function requireCore () {
	if (hasRequiredCore) return core;
	hasRequiredCore = 1;
	Object.defineProperty(core, "__esModule", { value: true });
	const id_1 = requireId();
	const ref_1 = requireRef();
	const core$1 = [
	    "$schema",
	    "$id",
	    "$defs",
	    "$vocabulary",
	    { keyword: "$comment" },
	    "definitions",
	    id_1.default,
	    ref_1.default,
	];
	core.default = core$1;
	
	return core;
}

var validation = {};

var limitNumber = {};

var hasRequiredLimitNumber;

function requireLimitNumber () {
	if (hasRequiredLimitNumber) return limitNumber;
	hasRequiredLimitNumber = 1;
	Object.defineProperty(limitNumber, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const ops = codegen_1.operators;
	const KWDs = {
	    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
	    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
	    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
	    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE },
	};
	const error = {
	    message: ({ keyword, schemaCode }) => (0, codegen_1.str) `must be ${KWDs[keyword].okStr} ${schemaCode}`,
	    params: ({ keyword, schemaCode }) => (0, codegen_1._) `{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`,
	};
	const def = {
	    keyword: Object.keys(KWDs),
	    type: "number",
	    schemaType: "number",
	    $data: true,
	    error,
	    code(cxt) {
	        const { keyword, data, schemaCode } = cxt;
	        cxt.fail$data((0, codegen_1._) `${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
	    },
	};
	limitNumber.default = def;
	
	return limitNumber;
}

var multipleOf = {};

var hasRequiredMultipleOf;

function requireMultipleOf () {
	if (hasRequiredMultipleOf) return multipleOf;
	hasRequiredMultipleOf = 1;
	Object.defineProperty(multipleOf, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const error = {
	    message: ({ schemaCode }) => (0, codegen_1.str) `must be multiple of ${schemaCode}`,
	    params: ({ schemaCode }) => (0, codegen_1._) `{multipleOf: ${schemaCode}}`,
	};
	const def = {
	    keyword: "multipleOf",
	    type: "number",
	    schemaType: "number",
	    $data: true,
	    error,
	    code(cxt) {
	        const { gen, data, schemaCode, it } = cxt;
	        // const bdt = bad$DataType(schemaCode, <string>def.schemaType, $data)
	        const prec = it.opts.multipleOfPrecision;
	        const res = gen.let("res");
	        const invalid = prec
	            ? (0, codegen_1._) `Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}`
	            : (0, codegen_1._) `${res} !== parseInt(${res})`;
	        cxt.fail$data((0, codegen_1._) `(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
	    },
	};
	multipleOf.default = def;
	
	return multipleOf;
}

var limitLength = {};

var ucs2length = {};

var hasRequiredUcs2length;

function requireUcs2length () {
	if (hasRequiredUcs2length) return ucs2length;
	hasRequiredUcs2length = 1;
	Object.defineProperty(ucs2length, "__esModule", { value: true });
	// https://mathiasbynens.be/notes/javascript-encoding
	// https://github.com/bestiejs/punycode.js - punycode.ucs2.decode
	function ucs2length$1(str) {
	    const len = str.length;
	    let length = 0;
	    let pos = 0;
	    let value;
	    while (pos < len) {
	        length++;
	        value = str.charCodeAt(pos++);
	        if (value >= 0xd800 && value <= 0xdbff && pos < len) {
	            // high surrogate, and there is a next character
	            value = str.charCodeAt(pos);
	            if ((value & 0xfc00) === 0xdc00)
	                pos++; // low surrogate
	        }
	    }
	    return length;
	}
	ucs2length.default = ucs2length$1;
	ucs2length$1.code = 'require("ajv/dist/runtime/ucs2length").default';
	
	return ucs2length;
}

var hasRequiredLimitLength;

function requireLimitLength () {
	if (hasRequiredLimitLength) return limitLength;
	hasRequiredLimitLength = 1;
	Object.defineProperty(limitLength, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const ucs2length_1 = requireUcs2length();
	const error = {
	    message({ keyword, schemaCode }) {
	        const comp = keyword === "maxLength" ? "more" : "fewer";
	        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} characters`;
	    },
	    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
	};
	const def = {
	    keyword: ["maxLength", "minLength"],
	    type: "string",
	    schemaType: "number",
	    $data: true,
	    error,
	    code(cxt) {
	        const { keyword, data, schemaCode, it } = cxt;
	        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
	        const len = it.opts.unicode === false ? (0, codegen_1._) `${data}.length` : (0, codegen_1._) `${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
	        cxt.fail$data((0, codegen_1._) `${len} ${op} ${schemaCode}`);
	    },
	};
	limitLength.default = def;
	
	return limitLength;
}

var pattern = {};

var hasRequiredPattern;

function requirePattern () {
	if (hasRequiredPattern) return pattern;
	hasRequiredPattern = 1;
	Object.defineProperty(pattern, "__esModule", { value: true });
	const code_1 = requireCode();
	const codegen_1 = requireCodegen();
	const error = {
	    message: ({ schemaCode }) => (0, codegen_1.str) `must match pattern "${schemaCode}"`,
	    params: ({ schemaCode }) => (0, codegen_1._) `{pattern: ${schemaCode}}`,
	};
	const def = {
	    keyword: "pattern",
	    type: "string",
	    schemaType: "string",
	    $data: true,
	    error,
	    code(cxt) {
	        const { data, $data, schema, schemaCode, it } = cxt;
	        // TODO regexp should be wrapped in try/catchs
	        const u = it.opts.unicodeRegExp ? "u" : "";
	        const regExp = $data ? (0, codegen_1._) `(new RegExp(${schemaCode}, ${u}))` : (0, code_1.usePattern)(cxt, schema);
	        cxt.fail$data((0, codegen_1._) `!${regExp}.test(${data})`);
	    },
	};
	pattern.default = def;
	
	return pattern;
}

var limitProperties = {};

var hasRequiredLimitProperties;

function requireLimitProperties () {
	if (hasRequiredLimitProperties) return limitProperties;
	hasRequiredLimitProperties = 1;
	Object.defineProperty(limitProperties, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const error = {
	    message({ keyword, schemaCode }) {
	        const comp = keyword === "maxProperties" ? "more" : "fewer";
	        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} properties`;
	    },
	    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
	};
	const def = {
	    keyword: ["maxProperties", "minProperties"],
	    type: "object",
	    schemaType: "number",
	    $data: true,
	    error,
	    code(cxt) {
	        const { keyword, data, schemaCode } = cxt;
	        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
	        cxt.fail$data((0, codegen_1._) `Object.keys(${data}).length ${op} ${schemaCode}`);
	    },
	};
	limitProperties.default = def;
	
	return limitProperties;
}

var required = {};

var hasRequiredRequired;

function requireRequired () {
	if (hasRequiredRequired) return required;
	hasRequiredRequired = 1;
	Object.defineProperty(required, "__esModule", { value: true });
	const code_1 = requireCode();
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params: { missingProperty } }) => (0, codegen_1.str) `must have required property '${missingProperty}'`,
	    params: ({ params: { missingProperty } }) => (0, codegen_1._) `{missingProperty: ${missingProperty}}`,
	};
	const def = {
	    keyword: "required",
	    type: "object",
	    schemaType: "array",
	    $data: true,
	    error,
	    code(cxt) {
	        const { gen, schema, schemaCode, data, $data, it } = cxt;
	        const { opts } = it;
	        if (!$data && schema.length === 0)
	            return;
	        const useLoop = schema.length >= opts.loopRequired;
	        if (it.allErrors)
	            allErrorsMode();
	        else
	            exitOnErrorMode();
	        if (opts.strictRequired) {
	            const props = cxt.parentSchema.properties;
	            const { definedProperties } = cxt.it;
	            for (const requiredKey of schema) {
	                if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === undefined && !definedProperties.has(requiredKey)) {
	                    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
	                    const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
	                    (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
	                }
	            }
	        }
	        function allErrorsMode() {
	            if (useLoop || $data) {
	                cxt.block$data(codegen_1.nil, loopAllRequired);
	            }
	            else {
	                for (const prop of schema) {
	                    (0, code_1.checkReportMissingProp)(cxt, prop);
	                }
	            }
	        }
	        function exitOnErrorMode() {
	            const missing = gen.let("missing");
	            if (useLoop || $data) {
	                const valid = gen.let("valid", true);
	                cxt.block$data(valid, () => loopUntilMissing(missing, valid));
	                cxt.ok(valid);
	            }
	            else {
	                gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
	                (0, code_1.reportMissingProp)(cxt, missing);
	                gen.else();
	            }
	        }
	        function loopAllRequired() {
	            gen.forOf("prop", schemaCode, (prop) => {
	                cxt.setParams({ missingProperty: prop });
	                gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
	            });
	        }
	        function loopUntilMissing(missing, valid) {
	            cxt.setParams({ missingProperty: missing });
	            gen.forOf(missing, schemaCode, () => {
	                gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
	                gen.if((0, codegen_1.not)(valid), () => {
	                    cxt.error();
	                    gen.break();
	                });
	            }, codegen_1.nil);
	        }
	    },
	};
	required.default = def;
	
	return required;
}

var limitItems = {};

var hasRequiredLimitItems;

function requireLimitItems () {
	if (hasRequiredLimitItems) return limitItems;
	hasRequiredLimitItems = 1;
	Object.defineProperty(limitItems, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const error = {
	    message({ keyword, schemaCode }) {
	        const comp = keyword === "maxItems" ? "more" : "fewer";
	        return (0, codegen_1.str) `must NOT have ${comp} than ${schemaCode} items`;
	    },
	    params: ({ schemaCode }) => (0, codegen_1._) `{limit: ${schemaCode}}`,
	};
	const def = {
	    keyword: ["maxItems", "minItems"],
	    type: "array",
	    schemaType: "number",
	    $data: true,
	    error,
	    code(cxt) {
	        const { keyword, data, schemaCode } = cxt;
	        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
	        cxt.fail$data((0, codegen_1._) `${data}.length ${op} ${schemaCode}`);
	    },
	};
	limitItems.default = def;
	
	return limitItems;
}

var uniqueItems = {};

var equal = {};

var hasRequiredEqual;

function requireEqual () {
	if (hasRequiredEqual) return equal;
	hasRequiredEqual = 1;
	Object.defineProperty(equal, "__esModule", { value: true });
	// https://github.com/ajv-validator/ajv/issues/889
	const equal$1 = requireFastDeepEqual();
	equal$1.code = 'require("ajv/dist/runtime/equal").default';
	equal.default = equal$1;
	
	return equal;
}

var hasRequiredUniqueItems;

function requireUniqueItems () {
	if (hasRequiredUniqueItems) return uniqueItems;
	hasRequiredUniqueItems = 1;
	Object.defineProperty(uniqueItems, "__esModule", { value: true });
	const dataType_1 = requireDataType();
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const equal_1 = requireEqual();
	const error = {
	    message: ({ params: { i, j } }) => (0, codegen_1.str) `must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
	    params: ({ params: { i, j } }) => (0, codegen_1._) `{i: ${i}, j: ${j}}`,
	};
	const def = {
	    keyword: "uniqueItems",
	    type: "array",
	    schemaType: "boolean",
	    $data: true,
	    error,
	    code(cxt) {
	        const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
	        if (!$data && !schema)
	            return;
	        const valid = gen.let("valid");
	        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
	        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._) `${schemaCode} === false`);
	        cxt.ok(valid);
	        function validateUniqueItems() {
	            const i = gen.let("i", (0, codegen_1._) `${data}.length`);
	            const j = gen.let("j");
	            cxt.setParams({ i, j });
	            gen.assign(valid, true);
	            gen.if((0, codegen_1._) `${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
	        }
	        function canOptimize() {
	            return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
	        }
	        function loopN(i, j) {
	            const item = gen.name("item");
	            const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
	            const indices = gen.const("indices", (0, codegen_1._) `{}`);
	            gen.for((0, codegen_1._) `;${i}--;`, () => {
	                gen.let(item, (0, codegen_1._) `${data}[${i}]`);
	                gen.if(wrongType, (0, codegen_1._) `continue`);
	                if (itemTypes.length > 1)
	                    gen.if((0, codegen_1._) `typeof ${item} == "string"`, (0, codegen_1._) `${item} += "_"`);
	                gen
	                    .if((0, codegen_1._) `typeof ${indices}[${item}] == "number"`, () => {
	                    gen.assign(j, (0, codegen_1._) `${indices}[${item}]`);
	                    cxt.error();
	                    gen.assign(valid, false).break();
	                })
	                    .code((0, codegen_1._) `${indices}[${item}] = ${i}`);
	            });
	        }
	        function loopN2(i, j) {
	            const eql = (0, util_1.useFunc)(gen, equal_1.default);
	            const outer = gen.name("outer");
	            gen.label(outer).for((0, codegen_1._) `;${i}--;`, () => gen.for((0, codegen_1._) `${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._) `${eql}(${data}[${i}], ${data}[${j}])`, () => {
	                cxt.error();
	                gen.assign(valid, false).break(outer);
	            })));
	        }
	    },
	};
	uniqueItems.default = def;
	
	return uniqueItems;
}

var _const = {};

var hasRequired_const;

function require_const () {
	if (hasRequired_const) return _const;
	hasRequired_const = 1;
	Object.defineProperty(_const, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const equal_1 = requireEqual();
	const error = {
	    message: "must be equal to constant",
	    params: ({ schemaCode }) => (0, codegen_1._) `{allowedValue: ${schemaCode}}`,
	};
	const def = {
	    keyword: "const",
	    $data: true,
	    error,
	    code(cxt) {
	        const { gen, data, $data, schemaCode, schema } = cxt;
	        if ($data || (schema && typeof schema == "object")) {
	            cxt.fail$data((0, codegen_1._) `!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
	        }
	        else {
	            cxt.fail((0, codegen_1._) `${schema} !== ${data}`);
	        }
	    },
	};
	_const.default = def;
	
	return _const;
}

var _enum = {};

var hasRequired_enum;

function require_enum () {
	if (hasRequired_enum) return _enum;
	hasRequired_enum = 1;
	Object.defineProperty(_enum, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const equal_1 = requireEqual();
	const error = {
	    message: "must be equal to one of the allowed values",
	    params: ({ schemaCode }) => (0, codegen_1._) `{allowedValues: ${schemaCode}}`,
	};
	const def = {
	    keyword: "enum",
	    schemaType: "array",
	    $data: true,
	    error,
	    code(cxt) {
	        const { gen, data, $data, schema, schemaCode, it } = cxt;
	        if (!$data && schema.length === 0)
	            throw new Error("enum must have non-empty array");
	        const useLoop = schema.length >= it.opts.loopEnum;
	        let eql;
	        const getEql = () => (eql !== null && eql !== void 0 ? eql : (eql = (0, util_1.useFunc)(gen, equal_1.default)));
	        let valid;
	        if (useLoop || $data) {
	            valid = gen.let("valid");
	            cxt.block$data(valid, loopEnum);
	        }
	        else {
	            /* istanbul ignore if */
	            if (!Array.isArray(schema))
	                throw new Error("ajv implementation error");
	            const vSchema = gen.const("vSchema", schemaCode);
	            valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
	        }
	        cxt.pass(valid);
	        function loopEnum() {
	            gen.assign(valid, false);
	            gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._) `${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
	        }
	        function equalCode(vSchema, i) {
	            const sch = schema[i];
	            return typeof sch === "object" && sch !== null
	                ? (0, codegen_1._) `${getEql()}(${data}, ${vSchema}[${i}])`
	                : (0, codegen_1._) `${data} === ${sch}`;
	        }
	    },
	};
	_enum.default = def;
	
	return _enum;
}

var hasRequiredValidation;

function requireValidation () {
	if (hasRequiredValidation) return validation;
	hasRequiredValidation = 1;
	Object.defineProperty(validation, "__esModule", { value: true });
	const limitNumber_1 = requireLimitNumber();
	const multipleOf_1 = requireMultipleOf();
	const limitLength_1 = requireLimitLength();
	const pattern_1 = requirePattern();
	const limitProperties_1 = requireLimitProperties();
	const required_1 = requireRequired();
	const limitItems_1 = requireLimitItems();
	const uniqueItems_1 = requireUniqueItems();
	const const_1 = require_const();
	const enum_1 = require_enum();
	const validation$1 = [
	    // number
	    limitNumber_1.default,
	    multipleOf_1.default,
	    // string
	    limitLength_1.default,
	    pattern_1.default,
	    // object
	    limitProperties_1.default,
	    required_1.default,
	    // array
	    limitItems_1.default,
	    uniqueItems_1.default,
	    // any
	    { keyword: "type", schemaType: ["string", "array"] },
	    { keyword: "nullable", schemaType: "boolean" },
	    const_1.default,
	    enum_1.default,
	];
	validation.default = validation$1;
	
	return validation;
}

var applicator = {};

var additionalItems = {};

var hasRequiredAdditionalItems;

function requireAdditionalItems () {
	if (hasRequiredAdditionalItems) return additionalItems;
	hasRequiredAdditionalItems = 1;
	Object.defineProperty(additionalItems, "__esModule", { value: true });
	additionalItems.validateAdditionalItems = void 0;
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params: { len } }) => (0, codegen_1.str) `must NOT have more than ${len} items`,
	    params: ({ params: { len } }) => (0, codegen_1._) `{limit: ${len}}`,
	};
	const def = {
	    keyword: "additionalItems",
	    type: "array",
	    schemaType: ["boolean", "object"],
	    before: "uniqueItems",
	    error,
	    code(cxt) {
	        const { parentSchema, it } = cxt;
	        const { items } = parentSchema;
	        if (!Array.isArray(items)) {
	            (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
	            return;
	        }
	        validateAdditionalItems(cxt, items);
	    },
	};
	function validateAdditionalItems(cxt, items) {
	    const { gen, schema, data, keyword, it } = cxt;
	    it.items = true;
	    const len = gen.const("len", (0, codegen_1._) `${data}.length`);
	    if (schema === false) {
	        cxt.setParams({ len: items.length });
	        cxt.pass((0, codegen_1._) `${len} <= ${items.length}`);
	    }
	    else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
	        const valid = gen.var("valid", (0, codegen_1._) `${len} <= ${items.length}`); // TODO var
	        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
	        cxt.ok(valid);
	    }
	    function validateItems(valid) {
	        gen.forRange("i", items.length, len, (i) => {
	            cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
	            if (!it.allErrors)
	                gen.if((0, codegen_1.not)(valid), () => gen.break());
	        });
	    }
	}
	additionalItems.validateAdditionalItems = validateAdditionalItems;
	additionalItems.default = def;
	
	return additionalItems;
}

var prefixItems = {};

var items = {};

var hasRequiredItems;

function requireItems () {
	if (hasRequiredItems) return items;
	hasRequiredItems = 1;
	Object.defineProperty(items, "__esModule", { value: true });
	items.validateTuple = void 0;
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const code_1 = requireCode();
	const def = {
	    keyword: "items",
	    type: "array",
	    schemaType: ["object", "array", "boolean"],
	    before: "uniqueItems",
	    code(cxt) {
	        const { schema, it } = cxt;
	        if (Array.isArray(schema))
	            return validateTuple(cxt, "additionalItems", schema);
	        it.items = true;
	        if ((0, util_1.alwaysValidSchema)(it, schema))
	            return;
	        cxt.ok((0, code_1.validateArray)(cxt));
	    },
	};
	function validateTuple(cxt, extraItems, schArr = cxt.schema) {
	    const { gen, parentSchema, data, keyword, it } = cxt;
	    checkStrictTuple(parentSchema);
	    if (it.opts.unevaluated && schArr.length && it.items !== true) {
	        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
	    }
	    const valid = gen.name("valid");
	    const len = gen.const("len", (0, codegen_1._) `${data}.length`);
	    schArr.forEach((sch, i) => {
	        if ((0, util_1.alwaysValidSchema)(it, sch))
	            return;
	        gen.if((0, codegen_1._) `${len} > ${i}`, () => cxt.subschema({
	            keyword,
	            schemaProp: i,
	            dataProp: i,
	        }, valid));
	        cxt.ok(valid);
	    });
	    function checkStrictTuple(sch) {
	        const { opts, errSchemaPath } = it;
	        const l = schArr.length;
	        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
	        if (opts.strictTuples && !fullTuple) {
	            const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
	            (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
	        }
	    }
	}
	items.validateTuple = validateTuple;
	items.default = def;
	
	return items;
}

var hasRequiredPrefixItems;

function requirePrefixItems () {
	if (hasRequiredPrefixItems) return prefixItems;
	hasRequiredPrefixItems = 1;
	Object.defineProperty(prefixItems, "__esModule", { value: true });
	const items_1 = requireItems();
	const def = {
	    keyword: "prefixItems",
	    type: "array",
	    schemaType: ["array"],
	    before: "uniqueItems",
	    code: (cxt) => (0, items_1.validateTuple)(cxt, "items"),
	};
	prefixItems.default = def;
	
	return prefixItems;
}

var items2020 = {};

var hasRequiredItems2020;

function requireItems2020 () {
	if (hasRequiredItems2020) return items2020;
	hasRequiredItems2020 = 1;
	Object.defineProperty(items2020, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const code_1 = requireCode();
	const additionalItems_1 = requireAdditionalItems();
	const error = {
	    message: ({ params: { len } }) => (0, codegen_1.str) `must NOT have more than ${len} items`,
	    params: ({ params: { len } }) => (0, codegen_1._) `{limit: ${len}}`,
	};
	const def = {
	    keyword: "items",
	    type: "array",
	    schemaType: ["object", "boolean"],
	    before: "uniqueItems",
	    error,
	    code(cxt) {
	        const { schema, parentSchema, it } = cxt;
	        const { prefixItems } = parentSchema;
	        it.items = true;
	        if ((0, util_1.alwaysValidSchema)(it, schema))
	            return;
	        if (prefixItems)
	            (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
	        else
	            cxt.ok((0, code_1.validateArray)(cxt));
	    },
	};
	items2020.default = def;
	
	return items2020;
}

var contains = {};

var hasRequiredContains;

function requireContains () {
	if (hasRequiredContains) return contains;
	hasRequiredContains = 1;
	Object.defineProperty(contains, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params: { min, max } }) => max === undefined
	        ? (0, codegen_1.str) `must contain at least ${min} valid item(s)`
	        : (0, codegen_1.str) `must contain at least ${min} and no more than ${max} valid item(s)`,
	    params: ({ params: { min, max } }) => max === undefined ? (0, codegen_1._) `{minContains: ${min}}` : (0, codegen_1._) `{minContains: ${min}, maxContains: ${max}}`,
	};
	const def = {
	    keyword: "contains",
	    type: "array",
	    schemaType: ["object", "boolean"],
	    before: "uniqueItems",
	    trackErrors: true,
	    error,
	    code(cxt) {
	        const { gen, schema, parentSchema, data, it } = cxt;
	        let min;
	        let max;
	        const { minContains, maxContains } = parentSchema;
	        if (it.opts.next) {
	            min = minContains === undefined ? 1 : minContains;
	            max = maxContains;
	        }
	        else {
	            min = 1;
	        }
	        const len = gen.const("len", (0, codegen_1._) `${data}.length`);
	        cxt.setParams({ min, max });
	        if (max === undefined && min === 0) {
	            (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
	            return;
	        }
	        if (max !== undefined && min > max) {
	            (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
	            cxt.fail();
	            return;
	        }
	        if ((0, util_1.alwaysValidSchema)(it, schema)) {
	            let cond = (0, codegen_1._) `${len} >= ${min}`;
	            if (max !== undefined)
	                cond = (0, codegen_1._) `${cond} && ${len} <= ${max}`;
	            cxt.pass(cond);
	            return;
	        }
	        it.items = true;
	        const valid = gen.name("valid");
	        if (max === undefined && min === 1) {
	            validateItems(valid, () => gen.if(valid, () => gen.break()));
	        }
	        else if (min === 0) {
	            gen.let(valid, true);
	            if (max !== undefined)
	                gen.if((0, codegen_1._) `${data}.length > 0`, validateItemsWithCount);
	        }
	        else {
	            gen.let(valid, false);
	            validateItemsWithCount();
	        }
	        cxt.result(valid, () => cxt.reset());
	        function validateItemsWithCount() {
	            const schValid = gen.name("_valid");
	            const count = gen.let("count", 0);
	            validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
	        }
	        function validateItems(_valid, block) {
	            gen.forRange("i", 0, len, (i) => {
	                cxt.subschema({
	                    keyword: "contains",
	                    dataProp: i,
	                    dataPropType: util_1.Type.Num,
	                    compositeRule: true,
	                }, _valid);
	                block();
	            });
	        }
	        function checkLimits(count) {
	            gen.code((0, codegen_1._) `${count}++`);
	            if (max === undefined) {
	                gen.if((0, codegen_1._) `${count} >= ${min}`, () => gen.assign(valid, true).break());
	            }
	            else {
	                gen.if((0, codegen_1._) `${count} > ${max}`, () => gen.assign(valid, false).break());
	                if (min === 1)
	                    gen.assign(valid, true);
	                else
	                    gen.if((0, codegen_1._) `${count} >= ${min}`, () => gen.assign(valid, true));
	            }
	        }
	    },
	};
	contains.default = def;
	
	return contains;
}

var dependencies = {};

var hasRequiredDependencies;

function requireDependencies () {
	if (hasRequiredDependencies) return dependencies;
	hasRequiredDependencies = 1;
	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = void 0;
		const codegen_1 = requireCodegen();
		const util_1 = requireUtil();
		const code_1 = requireCode();
		exports.error = {
		    message: ({ params: { property, depsCount, deps } }) => {
		        const property_ies = depsCount === 1 ? "property" : "properties";
		        return (0, codegen_1.str) `must have ${property_ies} ${deps} when property ${property} is present`;
		    },
		    params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._) `{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`, // TODO change to reference
		};
		const def = {
		    keyword: "dependencies",
		    type: "object",
		    schemaType: "object",
		    error: exports.error,
		    code(cxt) {
		        const [propDeps, schDeps] = splitDependencies(cxt);
		        validatePropertyDeps(cxt, propDeps);
		        validateSchemaDeps(cxt, schDeps);
		    },
		};
		function splitDependencies({ schema }) {
		    const propertyDeps = {};
		    const schemaDeps = {};
		    for (const key in schema) {
		        if (key === "__proto__")
		            continue;
		        const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
		        deps[key] = schema[key];
		    }
		    return [propertyDeps, schemaDeps];
		}
		function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
		    const { gen, data, it } = cxt;
		    if (Object.keys(propertyDeps).length === 0)
		        return;
		    const missing = gen.let("missing");
		    for (const prop in propertyDeps) {
		        const deps = propertyDeps[prop];
		        if (deps.length === 0)
		            continue;
		        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
		        cxt.setParams({
		            property: prop,
		            depsCount: deps.length,
		            deps: deps.join(", "),
		        });
		        if (it.allErrors) {
		            gen.if(hasProperty, () => {
		                for (const depProp of deps) {
		                    (0, code_1.checkReportMissingProp)(cxt, depProp);
		                }
		            });
		        }
		        else {
		            gen.if((0, codegen_1._) `${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
		            (0, code_1.reportMissingProp)(cxt, missing);
		            gen.else();
		        }
		    }
		}
		exports.validatePropertyDeps = validatePropertyDeps;
		function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
		    const { gen, data, keyword, it } = cxt;
		    const valid = gen.name("valid");
		    for (const prop in schemaDeps) {
		        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
		            continue;
		        gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
		            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
		            cxt.mergeValidEvaluated(schCxt, valid);
		        }, () => gen.var(valid, true) // TODO var
		        );
		        cxt.ok(valid);
		    }
		}
		exports.validateSchemaDeps = validateSchemaDeps;
		exports.default = def;
		
	} (dependencies));
	return dependencies;
}

var propertyNames = {};

var hasRequiredPropertyNames;

function requirePropertyNames () {
	if (hasRequiredPropertyNames) return propertyNames;
	hasRequiredPropertyNames = 1;
	Object.defineProperty(propertyNames, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: "property name must be valid",
	    params: ({ params }) => (0, codegen_1._) `{propertyName: ${params.propertyName}}`,
	};
	const def = {
	    keyword: "propertyNames",
	    type: "object",
	    schemaType: ["object", "boolean"],
	    error,
	    code(cxt) {
	        const { gen, schema, data, it } = cxt;
	        if ((0, util_1.alwaysValidSchema)(it, schema))
	            return;
	        const valid = gen.name("valid");
	        gen.forIn("key", data, (key) => {
	            cxt.setParams({ propertyName: key });
	            cxt.subschema({
	                keyword: "propertyNames",
	                data: key,
	                dataTypes: ["string"],
	                propertyName: key,
	                compositeRule: true,
	            }, valid);
	            gen.if((0, codegen_1.not)(valid), () => {
	                cxt.error(true);
	                if (!it.allErrors)
	                    gen.break();
	            });
	        });
	        cxt.ok(valid);
	    },
	};
	propertyNames.default = def;
	
	return propertyNames;
}

var additionalProperties = {};

var hasRequiredAdditionalProperties;

function requireAdditionalProperties () {
	if (hasRequiredAdditionalProperties) return additionalProperties;
	hasRequiredAdditionalProperties = 1;
	Object.defineProperty(additionalProperties, "__esModule", { value: true });
	const code_1 = requireCode();
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const util_1 = requireUtil();
	const error = {
	    message: "must NOT have additional properties",
	    params: ({ params }) => (0, codegen_1._) `{additionalProperty: ${params.additionalProperty}}`,
	};
	const def = {
	    keyword: "additionalProperties",
	    type: ["object"],
	    schemaType: ["boolean", "object"],
	    allowUndefined: true,
	    trackErrors: true,
	    error,
	    code(cxt) {
	        const { gen, schema, parentSchema, data, errsCount, it } = cxt;
	        /* istanbul ignore if */
	        if (!errsCount)
	            throw new Error("ajv implementation error");
	        const { allErrors, opts } = it;
	        it.props = true;
	        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
	            return;
	        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
	        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
	        checkAdditionalProperties();
	        cxt.ok((0, codegen_1._) `${errsCount} === ${names_1.default.errors}`);
	        function checkAdditionalProperties() {
	            gen.forIn("key", data, (key) => {
	                if (!props.length && !patProps.length)
	                    additionalPropertyCode(key);
	                else
	                    gen.if(isAdditional(key), () => additionalPropertyCode(key));
	            });
	        }
	        function isAdditional(key) {
	            let definedProp;
	            if (props.length > 8) {
	                // TODO maybe an option instead of hard-coded 8?
	                const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
	                definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
	            }
	            else if (props.length) {
	                definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._) `${key} === ${p}`));
	            }
	            else {
	                definedProp = codegen_1.nil;
	            }
	            if (patProps.length) {
	                definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._) `${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
	            }
	            return (0, codegen_1.not)(definedProp);
	        }
	        function deleteAdditional(key) {
	            gen.code((0, codegen_1._) `delete ${data}[${key}]`);
	        }
	        function additionalPropertyCode(key) {
	            if (opts.removeAdditional === "all" || (opts.removeAdditional && schema === false)) {
	                deleteAdditional(key);
	                return;
	            }
	            if (schema === false) {
	                cxt.setParams({ additionalProperty: key });
	                cxt.error();
	                if (!allErrors)
	                    gen.break();
	                return;
	            }
	            if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
	                const valid = gen.name("valid");
	                if (opts.removeAdditional === "failing") {
	                    applyAdditionalSchema(key, valid, false);
	                    gen.if((0, codegen_1.not)(valid), () => {
	                        cxt.reset();
	                        deleteAdditional(key);
	                    });
	                }
	                else {
	                    applyAdditionalSchema(key, valid);
	                    if (!allErrors)
	                        gen.if((0, codegen_1.not)(valid), () => gen.break());
	                }
	            }
	        }
	        function applyAdditionalSchema(key, valid, errors) {
	            const subschema = {
	                keyword: "additionalProperties",
	                dataProp: key,
	                dataPropType: util_1.Type.Str,
	            };
	            if (errors === false) {
	                Object.assign(subschema, {
	                    compositeRule: true,
	                    createErrors: false,
	                    allErrors: false,
	                });
	            }
	            cxt.subschema(subschema, valid);
	        }
	    },
	};
	additionalProperties.default = def;
	
	return additionalProperties;
}

var properties$8 = {};

var hasRequiredProperties;

function requireProperties () {
	if (hasRequiredProperties) return properties$8;
	hasRequiredProperties = 1;
	Object.defineProperty(properties$8, "__esModule", { value: true });
	const validate_1 = requireValidate();
	const code_1 = requireCode();
	const util_1 = requireUtil();
	const additionalProperties_1 = requireAdditionalProperties();
	const def = {
	    keyword: "properties",
	    type: "object",
	    schemaType: "object",
	    code(cxt) {
	        const { gen, schema, parentSchema, data, it } = cxt;
	        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === undefined) {
	            additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
	        }
	        const allProps = (0, code_1.allSchemaProperties)(schema);
	        for (const prop of allProps) {
	            it.definedProperties.add(prop);
	        }
	        if (it.opts.unevaluated && allProps.length && it.props !== true) {
	            it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
	        }
	        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
	        if (properties.length === 0)
	            return;
	        const valid = gen.name("valid");
	        for (const prop of properties) {
	            if (hasDefault(prop)) {
	                applyPropertySchema(prop);
	            }
	            else {
	                gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
	                applyPropertySchema(prop);
	                if (!it.allErrors)
	                    gen.else().var(valid, true);
	                gen.endIf();
	            }
	            cxt.it.definedProperties.add(prop);
	            cxt.ok(valid);
	        }
	        function hasDefault(prop) {
	            return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== undefined;
	        }
	        function applyPropertySchema(prop) {
	            cxt.subschema({
	                keyword: "properties",
	                schemaProp: prop,
	                dataProp: prop,
	            }, valid);
	        }
	    },
	};
	properties$8.default = def;
	
	return properties$8;
}

var patternProperties = {};

var hasRequiredPatternProperties;

function requirePatternProperties () {
	if (hasRequiredPatternProperties) return patternProperties;
	hasRequiredPatternProperties = 1;
	Object.defineProperty(patternProperties, "__esModule", { value: true });
	const code_1 = requireCode();
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const util_2 = requireUtil();
	const def = {
	    keyword: "patternProperties",
	    type: "object",
	    schemaType: "object",
	    code(cxt) {
	        const { gen, schema, data, parentSchema, it } = cxt;
	        const { opts } = it;
	        const patterns = (0, code_1.allSchemaProperties)(schema);
	        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
	        if (patterns.length === 0 ||
	            (alwaysValidPatterns.length === patterns.length &&
	                (!it.opts.unevaluated || it.props === true))) {
	            return;
	        }
	        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
	        const valid = gen.name("valid");
	        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
	            it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
	        }
	        const { props } = it;
	        validatePatternProperties();
	        function validatePatternProperties() {
	            for (const pat of patterns) {
	                if (checkProperties)
	                    checkMatchingProperties(pat);
	                if (it.allErrors) {
	                    validateProperties(pat);
	                }
	                else {
	                    gen.var(valid, true); // TODO var
	                    validateProperties(pat);
	                    gen.if(valid);
	                }
	            }
	        }
	        function checkMatchingProperties(pat) {
	            for (const prop in checkProperties) {
	                if (new RegExp(pat).test(prop)) {
	                    (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
	                }
	            }
	        }
	        function validateProperties(pat) {
	            gen.forIn("key", data, (key) => {
	                gen.if((0, codegen_1._) `${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
	                    const alwaysValid = alwaysValidPatterns.includes(pat);
	                    if (!alwaysValid) {
	                        cxt.subschema({
	                            keyword: "patternProperties",
	                            schemaProp: pat,
	                            dataProp: key,
	                            dataPropType: util_2.Type.Str,
	                        }, valid);
	                    }
	                    if (it.opts.unevaluated && props !== true) {
	                        gen.assign((0, codegen_1._) `${props}[${key}]`, true);
	                    }
	                    else if (!alwaysValid && !it.allErrors) {
	                        // can short-circuit if `unevaluatedProperties` is not supported (opts.next === false)
	                        // or if all properties were evaluated (props === true)
	                        gen.if((0, codegen_1.not)(valid), () => gen.break());
	                    }
	                });
	            });
	        }
	    },
	};
	patternProperties.default = def;
	
	return patternProperties;
}

var not = {};

var hasRequiredNot;

function requireNot () {
	if (hasRequiredNot) return not;
	hasRequiredNot = 1;
	Object.defineProperty(not, "__esModule", { value: true });
	const util_1 = requireUtil();
	const def = {
	    keyword: "not",
	    schemaType: ["object", "boolean"],
	    trackErrors: true,
	    code(cxt) {
	        const { gen, schema, it } = cxt;
	        if ((0, util_1.alwaysValidSchema)(it, schema)) {
	            cxt.fail();
	            return;
	        }
	        const valid = gen.name("valid");
	        cxt.subschema({
	            keyword: "not",
	            compositeRule: true,
	            createErrors: false,
	            allErrors: false,
	        }, valid);
	        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
	    },
	    error: { message: "must NOT be valid" },
	};
	not.default = def;
	
	return not;
}

var anyOf = {};

var hasRequiredAnyOf;

function requireAnyOf () {
	if (hasRequiredAnyOf) return anyOf;
	hasRequiredAnyOf = 1;
	Object.defineProperty(anyOf, "__esModule", { value: true });
	const code_1 = requireCode();
	const def = {
	    keyword: "anyOf",
	    schemaType: "array",
	    trackErrors: true,
	    code: code_1.validateUnion,
	    error: { message: "must match a schema in anyOf" },
	};
	anyOf.default = def;
	
	return anyOf;
}

var oneOf$1 = {};

var hasRequiredOneOf;

function requireOneOf () {
	if (hasRequiredOneOf) return oneOf$1;
	hasRequiredOneOf = 1;
	Object.defineProperty(oneOf$1, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: "must match exactly one schema in oneOf",
	    params: ({ params }) => (0, codegen_1._) `{passingSchemas: ${params.passing}}`,
	};
	const def = {
	    keyword: "oneOf",
	    schemaType: "array",
	    trackErrors: true,
	    error,
	    code(cxt) {
	        const { gen, schema, parentSchema, it } = cxt;
	        /* istanbul ignore if */
	        if (!Array.isArray(schema))
	            throw new Error("ajv implementation error");
	        if (it.opts.discriminator && parentSchema.discriminator)
	            return;
	        const schArr = schema;
	        const valid = gen.let("valid", false);
	        const passing = gen.let("passing", null);
	        const schValid = gen.name("_valid");
	        cxt.setParams({ passing });
	        // TODO possibly fail straight away (with warning or exception) if there are two empty always valid schemas
	        gen.block(validateOneOf);
	        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
	        function validateOneOf() {
	            schArr.forEach((sch, i) => {
	                let schCxt;
	                if ((0, util_1.alwaysValidSchema)(it, sch)) {
	                    gen.var(schValid, true);
	                }
	                else {
	                    schCxt = cxt.subschema({
	                        keyword: "oneOf",
	                        schemaProp: i,
	                        compositeRule: true,
	                    }, schValid);
	                }
	                if (i > 0) {
	                    gen
	                        .if((0, codegen_1._) `${schValid} && ${valid}`)
	                        .assign(valid, false)
	                        .assign(passing, (0, codegen_1._) `[${passing}, ${i}]`)
	                        .else();
	                }
	                gen.if(schValid, () => {
	                    gen.assign(valid, true);
	                    gen.assign(passing, i);
	                    if (schCxt)
	                        cxt.mergeEvaluated(schCxt, codegen_1.Name);
	                });
	            });
	        }
	    },
	};
	oneOf$1.default = def;
	
	return oneOf$1;
}

var allOf$1 = {};

var hasRequiredAllOf;

function requireAllOf () {
	if (hasRequiredAllOf) return allOf$1;
	hasRequiredAllOf = 1;
	Object.defineProperty(allOf$1, "__esModule", { value: true });
	const util_1 = requireUtil();
	const def = {
	    keyword: "allOf",
	    schemaType: "array",
	    code(cxt) {
	        const { gen, schema, it } = cxt;
	        /* istanbul ignore if */
	        if (!Array.isArray(schema))
	            throw new Error("ajv implementation error");
	        const valid = gen.name("valid");
	        schema.forEach((sch, i) => {
	            if ((0, util_1.alwaysValidSchema)(it, sch))
	                return;
	            const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
	            cxt.ok(valid);
	            cxt.mergeEvaluated(schCxt);
	        });
	    },
	};
	allOf$1.default = def;
	
	return allOf$1;
}

var _if = {};

var hasRequired_if;

function require_if () {
	if (hasRequired_if) return _if;
	hasRequired_if = 1;
	Object.defineProperty(_if, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params }) => (0, codegen_1.str) `must match "${params.ifClause}" schema`,
	    params: ({ params }) => (0, codegen_1._) `{failingKeyword: ${params.ifClause}}`,
	};
	const def = {
	    keyword: "if",
	    schemaType: ["object", "boolean"],
	    trackErrors: true,
	    error,
	    code(cxt) {
	        const { gen, parentSchema, it } = cxt;
	        if (parentSchema.then === undefined && parentSchema.else === undefined) {
	            (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
	        }
	        const hasThen = hasSchema(it, "then");
	        const hasElse = hasSchema(it, "else");
	        if (!hasThen && !hasElse)
	            return;
	        const valid = gen.let("valid", true);
	        const schValid = gen.name("_valid");
	        validateIf();
	        cxt.reset();
	        if (hasThen && hasElse) {
	            const ifClause = gen.let("ifClause");
	            cxt.setParams({ ifClause });
	            gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
	        }
	        else if (hasThen) {
	            gen.if(schValid, validateClause("then"));
	        }
	        else {
	            gen.if((0, codegen_1.not)(schValid), validateClause("else"));
	        }
	        cxt.pass(valid, () => cxt.error(true));
	        function validateIf() {
	            const schCxt = cxt.subschema({
	                keyword: "if",
	                compositeRule: true,
	                createErrors: false,
	                allErrors: false,
	            }, schValid);
	            cxt.mergeEvaluated(schCxt);
	        }
	        function validateClause(keyword, ifClause) {
	            return () => {
	                const schCxt = cxt.subschema({ keyword }, schValid);
	                gen.assign(valid, schValid);
	                cxt.mergeValidEvaluated(schCxt, valid);
	                if (ifClause)
	                    gen.assign(ifClause, (0, codegen_1._) `${keyword}`);
	                else
	                    cxt.setParams({ ifClause: keyword });
	            };
	        }
	    },
	};
	function hasSchema(it, keyword) {
	    const schema = it.schema[keyword];
	    return schema !== undefined && !(0, util_1.alwaysValidSchema)(it, schema);
	}
	_if.default = def;
	
	return _if;
}

var thenElse = {};

var hasRequiredThenElse;

function requireThenElse () {
	if (hasRequiredThenElse) return thenElse;
	hasRequiredThenElse = 1;
	Object.defineProperty(thenElse, "__esModule", { value: true });
	const util_1 = requireUtil();
	const def = {
	    keyword: ["then", "else"],
	    schemaType: ["object", "boolean"],
	    code({ keyword, parentSchema, it }) {
	        if (parentSchema.if === undefined)
	            (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
	    },
	};
	thenElse.default = def;
	
	return thenElse;
}

var hasRequiredApplicator;

function requireApplicator () {
	if (hasRequiredApplicator) return applicator;
	hasRequiredApplicator = 1;
	Object.defineProperty(applicator, "__esModule", { value: true });
	const additionalItems_1 = requireAdditionalItems();
	const prefixItems_1 = requirePrefixItems();
	const items_1 = requireItems();
	const items2020_1 = requireItems2020();
	const contains_1 = requireContains();
	const dependencies_1 = requireDependencies();
	const propertyNames_1 = requirePropertyNames();
	const additionalProperties_1 = requireAdditionalProperties();
	const properties_1 = requireProperties();
	const patternProperties_1 = requirePatternProperties();
	const not_1 = requireNot();
	const anyOf_1 = requireAnyOf();
	const oneOf_1 = requireOneOf();
	const allOf_1 = requireAllOf();
	const if_1 = require_if();
	const thenElse_1 = requireThenElse();
	function getApplicator(draft2020 = false) {
	    const applicator = [
	        // any
	        not_1.default,
	        anyOf_1.default,
	        oneOf_1.default,
	        allOf_1.default,
	        if_1.default,
	        thenElse_1.default,
	        // object
	        propertyNames_1.default,
	        additionalProperties_1.default,
	        dependencies_1.default,
	        properties_1.default,
	        patternProperties_1.default,
	    ];
	    // array
	    if (draft2020)
	        applicator.push(prefixItems_1.default, items2020_1.default);
	    else
	        applicator.push(additionalItems_1.default, items_1.default);
	    applicator.push(contains_1.default);
	    return applicator;
	}
	applicator.default = getApplicator;
	
	return applicator;
}

var dynamic = {};

var dynamicAnchor = {};

var hasRequiredDynamicAnchor;

function requireDynamicAnchor () {
	if (hasRequiredDynamicAnchor) return dynamicAnchor;
	hasRequiredDynamicAnchor = 1;
	Object.defineProperty(dynamicAnchor, "__esModule", { value: true });
	dynamicAnchor.dynamicAnchor = void 0;
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const compile_1 = requireCompile();
	const ref_1 = requireRef();
	const def = {
	    keyword: "$dynamicAnchor",
	    schemaType: "string",
	    code: (cxt) => dynamicAnchor$1(cxt, cxt.schema),
	};
	function dynamicAnchor$1(cxt, anchor) {
	    const { gen, it } = cxt;
	    it.schemaEnv.root.dynamicAnchors[anchor] = true;
	    const v = (0, codegen_1._) `${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
	    const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
	    gen.if((0, codegen_1._) `!${v}`, () => gen.assign(v, validate));
	}
	dynamicAnchor.dynamicAnchor = dynamicAnchor$1;
	function _getValidate(cxt) {
	    const { schemaEnv, schema, self } = cxt.it;
	    const { root, baseId, localRefs, meta } = schemaEnv.root;
	    const { schemaId } = self.opts;
	    const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
	    compile_1.compileSchema.call(self, sch);
	    return (0, ref_1.getValidate)(cxt, sch);
	}
	dynamicAnchor.default = def;
	
	return dynamicAnchor;
}

var dynamicRef = {};

var hasRequiredDynamicRef;

function requireDynamicRef () {
	if (hasRequiredDynamicRef) return dynamicRef;
	hasRequiredDynamicRef = 1;
	Object.defineProperty(dynamicRef, "__esModule", { value: true });
	dynamicRef.dynamicRef = void 0;
	const codegen_1 = requireCodegen();
	const names_1 = requireNames();
	const ref_1 = requireRef();
	const def = {
	    keyword: "$dynamicRef",
	    schemaType: "string",
	    code: (cxt) => dynamicRef$1(cxt, cxt.schema),
	};
	function dynamicRef$1(cxt, ref) {
	    const { gen, keyword, it } = cxt;
	    if (ref[0] !== "#")
	        throw new Error(`"${keyword}" only supports hash fragment reference`);
	    const anchor = ref.slice(1);
	    if (it.allErrors) {
	        _dynamicRef();
	    }
	    else {
	        const valid = gen.let("valid", false);
	        _dynamicRef(valid);
	        cxt.ok(valid);
	    }
	    function _dynamicRef(valid) {
	        // TODO the assumption here is that `recursiveRef: #` always points to the root
	        // of the schema object, which is not correct, because there may be $id that
	        // makes # point to it, and the target schema may not contain dynamic/recursiveAnchor.
	        // Because of that 2 tests in recursiveRef.json fail.
	        // This is a similar problem to #815 (`$id` doesn't alter resolution scope for `{ "$ref": "#" }`).
	        // (This problem is not tested in JSON-Schema-Test-Suite)
	        if (it.schemaEnv.root.dynamicAnchors[anchor]) {
	            const v = gen.let("_v", (0, codegen_1._) `${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
	            gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
	        }
	        else {
	            _callRef(it.validateName, valid)();
	        }
	    }
	    function _callRef(validate, valid) {
	        return valid
	            ? () => gen.block(() => {
	                (0, ref_1.callRef)(cxt, validate);
	                gen.let(valid, true);
	            })
	            : () => (0, ref_1.callRef)(cxt, validate);
	    }
	}
	dynamicRef.dynamicRef = dynamicRef$1;
	dynamicRef.default = def;
	
	return dynamicRef;
}

var recursiveAnchor = {};

var hasRequiredRecursiveAnchor;

function requireRecursiveAnchor () {
	if (hasRequiredRecursiveAnchor) return recursiveAnchor;
	hasRequiredRecursiveAnchor = 1;
	Object.defineProperty(recursiveAnchor, "__esModule", { value: true });
	const dynamicAnchor_1 = requireDynamicAnchor();
	const util_1 = requireUtil();
	const def = {
	    keyword: "$recursiveAnchor",
	    schemaType: "boolean",
	    code(cxt) {
	        if (cxt.schema)
	            (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
	        else
	            (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
	    },
	};
	recursiveAnchor.default = def;
	
	return recursiveAnchor;
}

var recursiveRef = {};

var hasRequiredRecursiveRef;

function requireRecursiveRef () {
	if (hasRequiredRecursiveRef) return recursiveRef;
	hasRequiredRecursiveRef = 1;
	Object.defineProperty(recursiveRef, "__esModule", { value: true });
	const dynamicRef_1 = requireDynamicRef();
	const def = {
	    keyword: "$recursiveRef",
	    schemaType: "string",
	    code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema),
	};
	recursiveRef.default = def;
	
	return recursiveRef;
}

var hasRequiredDynamic;

function requireDynamic () {
	if (hasRequiredDynamic) return dynamic;
	hasRequiredDynamic = 1;
	Object.defineProperty(dynamic, "__esModule", { value: true });
	const dynamicAnchor_1 = requireDynamicAnchor();
	const dynamicRef_1 = requireDynamicRef();
	const recursiveAnchor_1 = requireRecursiveAnchor();
	const recursiveRef_1 = requireRecursiveRef();
	const dynamic$1 = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
	dynamic.default = dynamic$1;
	
	return dynamic;
}

var next = {};

var dependentRequired = {};

var hasRequiredDependentRequired;

function requireDependentRequired () {
	if (hasRequiredDependentRequired) return dependentRequired;
	hasRequiredDependentRequired = 1;
	Object.defineProperty(dependentRequired, "__esModule", { value: true });
	const dependencies_1 = requireDependencies();
	const def = {
	    keyword: "dependentRequired",
	    type: "object",
	    schemaType: "object",
	    error: dependencies_1.error,
	    code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt),
	};
	dependentRequired.default = def;
	
	return dependentRequired;
}

var dependentSchemas = {};

var hasRequiredDependentSchemas;

function requireDependentSchemas () {
	if (hasRequiredDependentSchemas) return dependentSchemas;
	hasRequiredDependentSchemas = 1;
	Object.defineProperty(dependentSchemas, "__esModule", { value: true });
	const dependencies_1 = requireDependencies();
	const def = {
	    keyword: "dependentSchemas",
	    type: "object",
	    schemaType: "object",
	    code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt),
	};
	dependentSchemas.default = def;
	
	return dependentSchemas;
}

var limitContains = {};

var hasRequiredLimitContains;

function requireLimitContains () {
	if (hasRequiredLimitContains) return limitContains;
	hasRequiredLimitContains = 1;
	Object.defineProperty(limitContains, "__esModule", { value: true });
	const util_1 = requireUtil();
	const def = {
	    keyword: ["maxContains", "minContains"],
	    type: "array",
	    schemaType: "number",
	    code({ keyword, parentSchema, it }) {
	        if (parentSchema.contains === undefined) {
	            (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
	        }
	    },
	};
	limitContains.default = def;
	
	return limitContains;
}

var hasRequiredNext;

function requireNext () {
	if (hasRequiredNext) return next;
	hasRequiredNext = 1;
	Object.defineProperty(next, "__esModule", { value: true });
	const dependentRequired_1 = requireDependentRequired();
	const dependentSchemas_1 = requireDependentSchemas();
	const limitContains_1 = requireLimitContains();
	const next$1 = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
	next.default = next$1;
	
	return next;
}

var unevaluated = {};

var unevaluatedProperties = {};

var hasRequiredUnevaluatedProperties;

function requireUnevaluatedProperties () {
	if (hasRequiredUnevaluatedProperties) return unevaluatedProperties;
	hasRequiredUnevaluatedProperties = 1;
	Object.defineProperty(unevaluatedProperties, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const names_1 = requireNames();
	const error = {
	    message: "must NOT have unevaluated properties",
	    params: ({ params }) => (0, codegen_1._) `{unevaluatedProperty: ${params.unevaluatedProperty}}`,
	};
	const def = {
	    keyword: "unevaluatedProperties",
	    type: "object",
	    schemaType: ["boolean", "object"],
	    trackErrors: true,
	    error,
	    code(cxt) {
	        const { gen, schema, data, errsCount, it } = cxt;
	        /* istanbul ignore if */
	        if (!errsCount)
	            throw new Error("ajv implementation error");
	        const { allErrors, props } = it;
	        if (props instanceof codegen_1.Name) {
	            gen.if((0, codegen_1._) `${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
	        }
	        else if (props !== true) {
	            gen.forIn("key", data, (key) => props === undefined
	                ? unevaluatedPropCode(key)
	                : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
	        }
	        it.props = true;
	        cxt.ok((0, codegen_1._) `${errsCount} === ${names_1.default.errors}`);
	        function unevaluatedPropCode(key) {
	            if (schema === false) {
	                cxt.setParams({ unevaluatedProperty: key });
	                cxt.error();
	                if (!allErrors)
	                    gen.break();
	                return;
	            }
	            if (!(0, util_1.alwaysValidSchema)(it, schema)) {
	                const valid = gen.name("valid");
	                cxt.subschema({
	                    keyword: "unevaluatedProperties",
	                    dataProp: key,
	                    dataPropType: util_1.Type.Str,
	                }, valid);
	                if (!allErrors)
	                    gen.if((0, codegen_1.not)(valid), () => gen.break());
	            }
	        }
	        function unevaluatedDynamic(evaluatedProps, key) {
	            return (0, codegen_1._) `!${evaluatedProps} || !${evaluatedProps}[${key}]`;
	        }
	        function unevaluatedStatic(evaluatedProps, key) {
	            const ps = [];
	            for (const p in evaluatedProps) {
	                if (evaluatedProps[p] === true)
	                    ps.push((0, codegen_1._) `${key} !== ${p}`);
	            }
	            return (0, codegen_1.and)(...ps);
	        }
	    },
	};
	unevaluatedProperties.default = def;
	
	return unevaluatedProperties;
}

var unevaluatedItems = {};

var hasRequiredUnevaluatedItems;

function requireUnevaluatedItems () {
	if (hasRequiredUnevaluatedItems) return unevaluatedItems;
	hasRequiredUnevaluatedItems = 1;
	Object.defineProperty(unevaluatedItems, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params: { len } }) => (0, codegen_1.str) `must NOT have more than ${len} items`,
	    params: ({ params: { len } }) => (0, codegen_1._) `{limit: ${len}}`,
	};
	const def = {
	    keyword: "unevaluatedItems",
	    type: "array",
	    schemaType: ["boolean", "object"],
	    error,
	    code(cxt) {
	        const { gen, schema, data, it } = cxt;
	        const items = it.items || 0;
	        if (items === true)
	            return;
	        const len = gen.const("len", (0, codegen_1._) `${data}.length`);
	        if (schema === false) {
	            cxt.setParams({ len: items });
	            cxt.fail((0, codegen_1._) `${len} > ${items}`);
	        }
	        else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
	            const valid = gen.var("valid", (0, codegen_1._) `${len} <= ${items}`);
	            gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
	            cxt.ok(valid);
	        }
	        it.items = true;
	        function validateItems(valid, from) {
	            gen.forRange("i", from, len, (i) => {
	                cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
	                if (!it.allErrors)
	                    gen.if((0, codegen_1.not)(valid), () => gen.break());
	            });
	        }
	    },
	};
	unevaluatedItems.default = def;
	
	return unevaluatedItems;
}

var hasRequiredUnevaluated;

function requireUnevaluated () {
	if (hasRequiredUnevaluated) return unevaluated;
	hasRequiredUnevaluated = 1;
	Object.defineProperty(unevaluated, "__esModule", { value: true });
	const unevaluatedProperties_1 = requireUnevaluatedProperties();
	const unevaluatedItems_1 = requireUnevaluatedItems();
	const unevaluated$1 = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
	unevaluated.default = unevaluated$1;
	
	return unevaluated;
}

var format$1 = {};

var format = {};

var hasRequiredFormat$1;

function requireFormat$1 () {
	if (hasRequiredFormat$1) return format;
	hasRequiredFormat$1 = 1;
	Object.defineProperty(format, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const error = {
	    message: ({ schemaCode }) => (0, codegen_1.str) `must match format "${schemaCode}"`,
	    params: ({ schemaCode }) => (0, codegen_1._) `{format: ${schemaCode}}`,
	};
	const def = {
	    keyword: "format",
	    type: ["number", "string"],
	    schemaType: "string",
	    $data: true,
	    error,
	    code(cxt, ruleType) {
	        const { gen, data, $data, schema, schemaCode, it } = cxt;
	        const { opts, errSchemaPath, schemaEnv, self } = it;
	        if (!opts.validateFormats)
	            return;
	        if ($data)
	            validate$DataFormat();
	        else
	            validateFormat();
	        function validate$DataFormat() {
	            const fmts = gen.scopeValue("formats", {
	                ref: self.formats,
	                code: opts.code.formats,
	            });
	            const fDef = gen.const("fDef", (0, codegen_1._) `${fmts}[${schemaCode}]`);
	            const fType = gen.let("fType");
	            const format = gen.let("format");
	            // TODO simplify
	            gen.if((0, codegen_1._) `typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._) `${fDef}.type || "string"`).assign(format, (0, codegen_1._) `${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._) `"string"`).assign(format, fDef));
	            cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
	            function unknownFmt() {
	                if (opts.strictSchema === false)
	                    return codegen_1.nil;
	                return (0, codegen_1._) `${schemaCode} && !${format}`;
	            }
	            function invalidFmt() {
	                const callFormat = schemaEnv.$async
	                    ? (0, codegen_1._) `(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))`
	                    : (0, codegen_1._) `${format}(${data})`;
	                const validData = (0, codegen_1._) `(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
	                return (0, codegen_1._) `${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
	            }
	        }
	        function validateFormat() {
	            const formatDef = self.formats[schema];
	            if (!formatDef) {
	                unknownFormat();
	                return;
	            }
	            if (formatDef === true)
	                return;
	            const [fmtType, format, fmtRef] = getFormat(formatDef);
	            if (fmtType === ruleType)
	                cxt.pass(validCondition());
	            function unknownFormat() {
	                if (opts.strictSchema === false) {
	                    self.logger.warn(unknownMsg());
	                    return;
	                }
	                throw new Error(unknownMsg());
	                function unknownMsg() {
	                    return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
	                }
	            }
	            function getFormat(fmtDef) {
	                const code = fmtDef instanceof RegExp
	                    ? (0, codegen_1.regexpCode)(fmtDef)
	                    : opts.code.formats
	                        ? (0, codegen_1._) `${opts.code.formats}${(0, codegen_1.getProperty)(schema)}`
	                        : undefined;
	                const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
	                if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
	                    return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._) `${fmt}.validate`];
	                }
	                return ["string", fmtDef, fmt];
	            }
	            function validCondition() {
	                if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
	                    if (!schemaEnv.$async)
	                        throw new Error("async format in sync schema");
	                    return (0, codegen_1._) `await ${fmtRef}(${data})`;
	                }
	                return typeof format == "function" ? (0, codegen_1._) `${fmtRef}(${data})` : (0, codegen_1._) `${fmtRef}.test(${data})`;
	            }
	        }
	    },
	};
	format.default = def;
	
	return format;
}

var hasRequiredFormat;

function requireFormat () {
	if (hasRequiredFormat) return format$1;
	hasRequiredFormat = 1;
	Object.defineProperty(format$1, "__esModule", { value: true });
	const format_1 = requireFormat$1();
	const format = [format_1.default];
	format$1.default = format;
	
	return format$1;
}

var metadata = {};

var hasRequiredMetadata;

function requireMetadata () {
	if (hasRequiredMetadata) return metadata;
	hasRequiredMetadata = 1;
	Object.defineProperty(metadata, "__esModule", { value: true });
	metadata.contentVocabulary = metadata.metadataVocabulary = void 0;
	metadata.metadataVocabulary = [
	    "title",
	    "description",
	    "default",
	    "deprecated",
	    "readOnly",
	    "writeOnly",
	    "examples",
	];
	metadata.contentVocabulary = [
	    "contentMediaType",
	    "contentEncoding",
	    "contentSchema",
	];
	
	return metadata;
}

var hasRequiredDraft2020;

function requireDraft2020 () {
	if (hasRequiredDraft2020) return draft2020;
	hasRequiredDraft2020 = 1;
	Object.defineProperty(draft2020, "__esModule", { value: true });
	const core_1 = requireCore();
	const validation_1 = requireValidation();
	const applicator_1 = requireApplicator();
	const dynamic_1 = requireDynamic();
	const next_1 = requireNext();
	const unevaluated_1 = requireUnevaluated();
	const format_1 = requireFormat();
	const metadata_1 = requireMetadata();
	const draft2020Vocabularies = [
	    dynamic_1.default,
	    core_1.default,
	    validation_1.default,
	    (0, applicator_1.default)(true),
	    format_1.default,
	    metadata_1.metadataVocabulary,
	    metadata_1.contentVocabulary,
	    next_1.default,
	    unevaluated_1.default,
	];
	draft2020.default = draft2020Vocabularies;
	
	return draft2020;
}

var discriminator = {};

var types = {};

var hasRequiredTypes;

function requireTypes () {
	if (hasRequiredTypes) return types;
	hasRequiredTypes = 1;
	Object.defineProperty(types, "__esModule", { value: true });
	types.DiscrError = void 0;
	var DiscrError;
	(function (DiscrError) {
	    DiscrError["Tag"] = "tag";
	    DiscrError["Mapping"] = "mapping";
	})(DiscrError || (types.DiscrError = DiscrError = {}));
	
	return types;
}

var hasRequiredDiscriminator;

function requireDiscriminator () {
	if (hasRequiredDiscriminator) return discriminator;
	hasRequiredDiscriminator = 1;
	Object.defineProperty(discriminator, "__esModule", { value: true });
	const codegen_1 = requireCodegen();
	const types_1 = requireTypes();
	const compile_1 = requireCompile();
	const ref_error_1 = requireRef_error();
	const util_1 = requireUtil();
	const error = {
	    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag
	        ? `tag "${tagName}" must be string`
	        : `value of tag "${tagName}" must be in oneOf`,
	    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._) `{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`,
	};
	const def = {
	    keyword: "discriminator",
	    type: "object",
	    schemaType: "object",
	    error,
	    code(cxt) {
	        const { gen, data, schema, parentSchema, it } = cxt;
	        const { oneOf } = parentSchema;
	        if (!it.opts.discriminator) {
	            throw new Error("discriminator: requires discriminator option");
	        }
	        const tagName = schema.propertyName;
	        if (typeof tagName != "string")
	            throw new Error("discriminator: requires propertyName");
	        if (schema.mapping)
	            throw new Error("discriminator: mapping is not supported");
	        if (!oneOf)
	            throw new Error("discriminator: requires oneOf keyword");
	        const valid = gen.let("valid", false);
	        const tag = gen.const("tag", (0, codegen_1._) `${data}${(0, codegen_1.getProperty)(tagName)}`);
	        gen.if((0, codegen_1._) `typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
	        cxt.ok(valid);
	        function validateMapping() {
	            const mapping = getMapping();
	            gen.if(false);
	            for (const tagValue in mapping) {
	                gen.elseIf((0, codegen_1._) `${tag} === ${tagValue}`);
	                gen.assign(valid, applyTagSchema(mapping[tagValue]));
	            }
	            gen.else();
	            cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
	            gen.endIf();
	        }
	        function applyTagSchema(schemaProp) {
	            const _valid = gen.name("valid");
	            const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
	            cxt.mergeEvaluated(schCxt, codegen_1.Name);
	            return _valid;
	        }
	        function getMapping() {
	            var _a;
	            const oneOfMapping = {};
	            const topRequired = hasRequired(parentSchema);
	            let tagRequired = true;
	            for (let i = 0; i < oneOf.length; i++) {
	                let sch = oneOf[i];
	                if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
	                    const ref = sch.$ref;
	                    sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
	                    if (sch instanceof compile_1.SchemaEnv)
	                        sch = sch.schema;
	                    if (sch === undefined)
	                        throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
	                }
	                const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
	                if (typeof propSch != "object") {
	                    throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
	                }
	                tagRequired = tagRequired && (topRequired || hasRequired(sch));
	                addMappings(propSch, i);
	            }
	            if (!tagRequired)
	                throw new Error(`discriminator: "${tagName}" must be required`);
	            return oneOfMapping;
	            function hasRequired({ required }) {
	                return Array.isArray(required) && required.includes(tagName);
	            }
	            function addMappings(sch, i) {
	                if (sch.const) {
	                    addMapping(sch.const, i);
	                }
	                else if (sch.enum) {
	                    for (const tagValue of sch.enum) {
	                        addMapping(tagValue, i);
	                    }
	                }
	                else {
	                    throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
	                }
	            }
	            function addMapping(tagValue, i) {
	                if (typeof tagValue != "string" || tagValue in oneOfMapping) {
	                    throw new Error(`discriminator: "${tagName}" values must be unique strings`);
	                }
	                oneOfMapping[tagValue] = i;
	            }
	        }
	    },
	};
	discriminator.default = def;
	
	return discriminator;
}

var jsonSchema202012 = {};

var $schema$8 = "https://json-schema.org/draft/2020-12/schema";
var $id$8 = "https://json-schema.org/draft/2020-12/schema";
var $vocabulary$7 = {
	"https://json-schema.org/draft/2020-12/vocab/core": true,
	"https://json-schema.org/draft/2020-12/vocab/applicator": true,
	"https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
	"https://json-schema.org/draft/2020-12/vocab/validation": true,
	"https://json-schema.org/draft/2020-12/vocab/meta-data": true,
	"https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
	"https://json-schema.org/draft/2020-12/vocab/content": true
};
var $dynamicAnchor$7 = "meta";
var title$8 = "Core and Validation specifications meta-schema";
var allOf = [
	{
		$ref: "meta/core"
	},
	{
		$ref: "meta/applicator"
	},
	{
		$ref: "meta/unevaluated"
	},
	{
		$ref: "meta/validation"
	},
	{
		$ref: "meta/meta-data"
	},
	{
		$ref: "meta/format-annotation"
	},
	{
		$ref: "meta/content"
	}
];
var type$7 = [
	"object",
	"boolean"
];
var $comment = "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.";
var properties$7 = {
	definitions: {
		$comment: "\"definitions\" has been replaced by \"$defs\".",
		type: "object",
		additionalProperties: {
			$dynamicRef: "#meta"
		},
		deprecated: true,
		"default": {
		}
	},
	dependencies: {
		$comment: "\"dependencies\" has been split and replaced by \"dependentSchemas\" and \"dependentRequired\" in order to serve their differing semantics.",
		type: "object",
		additionalProperties: {
			anyOf: [
				{
					$dynamicRef: "#meta"
				},
				{
					$ref: "meta/validation#/$defs/stringArray"
				}
			]
		},
		deprecated: true,
		"default": {
		}
	},
	$recursiveAnchor: {
		$comment: "\"$recursiveAnchor\" has been replaced by \"$dynamicAnchor\".",
		$ref: "meta/core#/$defs/anchorString",
		deprecated: true
	},
	$recursiveRef: {
		$comment: "\"$recursiveRef\" has been replaced by \"$dynamicRef\".",
		$ref: "meta/core#/$defs/uriReferenceString",
		deprecated: true
	}
};
var require$$0 = {
	$schema: $schema$8,
	$id: $id$8,
	$vocabulary: $vocabulary$7,
	$dynamicAnchor: $dynamicAnchor$7,
	title: title$8,
	allOf: allOf,
	type: type$7,
	$comment: $comment,
	properties: properties$7
};

var $schema$7 = "https://json-schema.org/draft/2020-12/schema";
var $id$7 = "https://json-schema.org/draft/2020-12/meta/applicator";
var $vocabulary$6 = {
	"https://json-schema.org/draft/2020-12/vocab/applicator": true
};
var $dynamicAnchor$6 = "meta";
var title$7 = "Applicator vocabulary meta-schema";
var type$6 = [
	"object",
	"boolean"
];
var properties$6 = {
	prefixItems: {
		$ref: "#/$defs/schemaArray"
	},
	items: {
		$dynamicRef: "#meta"
	},
	contains: {
		$dynamicRef: "#meta"
	},
	additionalProperties: {
		$dynamicRef: "#meta"
	},
	properties: {
		type: "object",
		additionalProperties: {
			$dynamicRef: "#meta"
		},
		"default": {
		}
	},
	patternProperties: {
		type: "object",
		additionalProperties: {
			$dynamicRef: "#meta"
		},
		propertyNames: {
			format: "regex"
		},
		"default": {
		}
	},
	dependentSchemas: {
		type: "object",
		additionalProperties: {
			$dynamicRef: "#meta"
		},
		"default": {
		}
	},
	propertyNames: {
		$dynamicRef: "#meta"
	},
	"if": {
		$dynamicRef: "#meta"
	},
	then: {
		$dynamicRef: "#meta"
	},
	"else": {
		$dynamicRef: "#meta"
	},
	allOf: {
		$ref: "#/$defs/schemaArray"
	},
	anyOf: {
		$ref: "#/$defs/schemaArray"
	},
	oneOf: {
		$ref: "#/$defs/schemaArray"
	},
	not: {
		$dynamicRef: "#meta"
	}
};
var $defs$3 = {
	schemaArray: {
		type: "array",
		minItems: 1,
		items: {
			$dynamicRef: "#meta"
		}
	}
};
var require$$1 = {
	$schema: $schema$7,
	$id: $id$7,
	$vocabulary: $vocabulary$6,
	$dynamicAnchor: $dynamicAnchor$6,
	title: title$7,
	type: type$6,
	properties: properties$6,
	$defs: $defs$3
};

var $schema$6 = "https://json-schema.org/draft/2020-12/schema";
var $id$6 = "https://json-schema.org/draft/2020-12/meta/unevaluated";
var $vocabulary$5 = {
	"https://json-schema.org/draft/2020-12/vocab/unevaluated": true
};
var $dynamicAnchor$5 = "meta";
var title$6 = "Unevaluated applicator vocabulary meta-schema";
var type$5 = [
	"object",
	"boolean"
];
var properties$5 = {
	unevaluatedItems: {
		$dynamicRef: "#meta"
	},
	unevaluatedProperties: {
		$dynamicRef: "#meta"
	}
};
var require$$2 = {
	$schema: $schema$6,
	$id: $id$6,
	$vocabulary: $vocabulary$5,
	$dynamicAnchor: $dynamicAnchor$5,
	title: title$6,
	type: type$5,
	properties: properties$5
};

var $schema$5 = "https://json-schema.org/draft/2020-12/schema";
var $id$5 = "https://json-schema.org/draft/2020-12/meta/content";
var $vocabulary$4 = {
	"https://json-schema.org/draft/2020-12/vocab/content": true
};
var $dynamicAnchor$4 = "meta";
var title$5 = "Content vocabulary meta-schema";
var type$4 = [
	"object",
	"boolean"
];
var properties$4 = {
	contentEncoding: {
		type: "string"
	},
	contentMediaType: {
		type: "string"
	},
	contentSchema: {
		$dynamicRef: "#meta"
	}
};
var require$$3 = {
	$schema: $schema$5,
	$id: $id$5,
	$vocabulary: $vocabulary$4,
	$dynamicAnchor: $dynamicAnchor$4,
	title: title$5,
	type: type$4,
	properties: properties$4
};

var $schema$4 = "https://json-schema.org/draft/2020-12/schema";
var $id$4 = "https://json-schema.org/draft/2020-12/meta/core";
var $vocabulary$3 = {
	"https://json-schema.org/draft/2020-12/vocab/core": true
};
var $dynamicAnchor$3 = "meta";
var title$4 = "Core vocabulary meta-schema";
var type$3 = [
	"object",
	"boolean"
];
var properties$3 = {
	$id: {
		$ref: "#/$defs/uriReferenceString",
		$comment: "Non-empty fragments not allowed.",
		pattern: "^[^#]*#?$"
	},
	$schema: {
		$ref: "#/$defs/uriString"
	},
	$ref: {
		$ref: "#/$defs/uriReferenceString"
	},
	$anchor: {
		$ref: "#/$defs/anchorString"
	},
	$dynamicRef: {
		$ref: "#/$defs/uriReferenceString"
	},
	$dynamicAnchor: {
		$ref: "#/$defs/anchorString"
	},
	$vocabulary: {
		type: "object",
		propertyNames: {
			$ref: "#/$defs/uriString"
		},
		additionalProperties: {
			type: "boolean"
		}
	},
	$comment: {
		type: "string"
	},
	$defs: {
		type: "object",
		additionalProperties: {
			$dynamicRef: "#meta"
		}
	}
};
var $defs$2 = {
	anchorString: {
		type: "string",
		pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
	},
	uriString: {
		type: "string",
		format: "uri"
	},
	uriReferenceString: {
		type: "string",
		format: "uri-reference"
	}
};
var require$$4 = {
	$schema: $schema$4,
	$id: $id$4,
	$vocabulary: $vocabulary$3,
	$dynamicAnchor: $dynamicAnchor$3,
	title: title$4,
	type: type$3,
	properties: properties$3,
	$defs: $defs$2
};

var $schema$3 = "https://json-schema.org/draft/2020-12/schema";
var $id$3 = "https://json-schema.org/draft/2020-12/meta/format-annotation";
var $vocabulary$2 = {
	"https://json-schema.org/draft/2020-12/vocab/format-annotation": true
};
var $dynamicAnchor$2 = "meta";
var title$3 = "Format vocabulary meta-schema for annotation results";
var type$2 = [
	"object",
	"boolean"
];
var properties$2 = {
	format: {
		type: "string"
	}
};
var require$$5 = {
	$schema: $schema$3,
	$id: $id$3,
	$vocabulary: $vocabulary$2,
	$dynamicAnchor: $dynamicAnchor$2,
	title: title$3,
	type: type$2,
	properties: properties$2
};

var $schema$2 = "https://json-schema.org/draft/2020-12/schema";
var $id$2 = "https://json-schema.org/draft/2020-12/meta/meta-data";
var $vocabulary$1 = {
	"https://json-schema.org/draft/2020-12/vocab/meta-data": true
};
var $dynamicAnchor$1 = "meta";
var title$2 = "Meta-data vocabulary meta-schema";
var type$1 = [
	"object",
	"boolean"
];
var properties$1 = {
	title: {
		type: "string"
	},
	description: {
		type: "string"
	},
	"default": true,
	deprecated: {
		type: "boolean",
		"default": false
	},
	readOnly: {
		type: "boolean",
		"default": false
	},
	writeOnly: {
		type: "boolean",
		"default": false
	},
	examples: {
		type: "array",
		items: true
	}
};
var require$$6 = {
	$schema: $schema$2,
	$id: $id$2,
	$vocabulary: $vocabulary$1,
	$dynamicAnchor: $dynamicAnchor$1,
	title: title$2,
	type: type$1,
	properties: properties$1
};

var $schema$1 = "https://json-schema.org/draft/2020-12/schema";
var $id$1 = "https://json-schema.org/draft/2020-12/meta/validation";
var $vocabulary = {
	"https://json-schema.org/draft/2020-12/vocab/validation": true
};
var $dynamicAnchor = "meta";
var title$1 = "Validation vocabulary meta-schema";
var type = [
	"object",
	"boolean"
];
var properties = {
	type: {
		anyOf: [
			{
				$ref: "#/$defs/simpleTypes"
			},
			{
				type: "array",
				items: {
					$ref: "#/$defs/simpleTypes"
				},
				minItems: 1,
				uniqueItems: true
			}
		]
	},
	"const": true,
	"enum": {
		type: "array",
		items: true
	},
	multipleOf: {
		type: "number",
		exclusiveMinimum: 0
	},
	maximum: {
		type: "number"
	},
	exclusiveMaximum: {
		type: "number"
	},
	minimum: {
		type: "number"
	},
	exclusiveMinimum: {
		type: "number"
	},
	maxLength: {
		$ref: "#/$defs/nonNegativeInteger"
	},
	minLength: {
		$ref: "#/$defs/nonNegativeIntegerDefault0"
	},
	pattern: {
		type: "string",
		format: "regex"
	},
	maxItems: {
		$ref: "#/$defs/nonNegativeInteger"
	},
	minItems: {
		$ref: "#/$defs/nonNegativeIntegerDefault0"
	},
	uniqueItems: {
		type: "boolean",
		"default": false
	},
	maxContains: {
		$ref: "#/$defs/nonNegativeInteger"
	},
	minContains: {
		$ref: "#/$defs/nonNegativeInteger",
		"default": 1
	},
	maxProperties: {
		$ref: "#/$defs/nonNegativeInteger"
	},
	minProperties: {
		$ref: "#/$defs/nonNegativeIntegerDefault0"
	},
	required: {
		$ref: "#/$defs/stringArray"
	},
	dependentRequired: {
		type: "object",
		additionalProperties: {
			$ref: "#/$defs/stringArray"
		}
	}
};
var $defs$1 = {
	nonNegativeInteger: {
		type: "integer",
		minimum: 0
	},
	nonNegativeIntegerDefault0: {
		$ref: "#/$defs/nonNegativeInteger",
		"default": 0
	},
	simpleTypes: {
		"enum": [
			"array",
			"boolean",
			"integer",
			"null",
			"number",
			"object",
			"string"
		]
	},
	stringArray: {
		type: "array",
		items: {
			type: "string"
		},
		uniqueItems: true,
		"default": [
		]
	}
};
var require$$7 = {
	$schema: $schema$1,
	$id: $id$1,
	$vocabulary: $vocabulary,
	$dynamicAnchor: $dynamicAnchor,
	title: title$1,
	type: type,
	properties: properties,
	$defs: $defs$1
};

var hasRequiredJsonSchema202012;

function requireJsonSchema202012 () {
	if (hasRequiredJsonSchema202012) return jsonSchema202012;
	hasRequiredJsonSchema202012 = 1;
	Object.defineProperty(jsonSchema202012, "__esModule", { value: true });
	const metaSchema = require$$0;
	const applicator = require$$1;
	const unevaluated = require$$2;
	const content = require$$3;
	const core = require$$4;
	const format = require$$5;
	const metadata = require$$6;
	const validation = require$$7;
	const META_SUPPORT_DATA = ["/properties"];
	function addMetaSchema2020($data) {
	    [
	        metaSchema,
	        applicator,
	        unevaluated,
	        content,
	        core,
	        with$data(this, format),
	        metadata,
	        with$data(this, validation),
	    ].forEach((sch) => this.addMetaSchema(sch, undefined, false));
	    return this;
	    function with$data(ajv, sch) {
	        return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
	    }
	}
	jsonSchema202012.default = addMetaSchema2020;
	
	return jsonSchema202012;
}

var hasRequired_2020;

function require_2020 () {
	if (hasRequired_2020) return _2020.exports;
	hasRequired_2020 = 1;
	(function (module, exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = void 0;
		const core_1 = requireCore$1();
		const draft2020_1 = requireDraft2020();
		const discriminator_1 = requireDiscriminator();
		const json_schema_2020_12_1 = requireJsonSchema202012();
		const META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";
		class Ajv2020 extends core_1.default {
		    constructor(opts = {}) {
		        super({
		            ...opts,
		            dynamicRef: true,
		            next: true,
		            unevaluated: true,
		        });
		    }
		    _addVocabularies() {
		        super._addVocabularies();
		        draft2020_1.default.forEach((v) => this.addVocabulary(v));
		        if (this.opts.discriminator)
		            this.addKeyword(discriminator_1.default);
		    }
		    _addDefaultMetaSchema() {
		        super._addDefaultMetaSchema();
		        const { $data, meta } = this.opts;
		        if (!meta)
		            return;
		        json_schema_2020_12_1.default.call(this, $data);
		        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
		    }
		    defaultMeta() {
		        return (this.opts.defaultMeta =
		            super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined));
		    }
		}
		exports.Ajv2020 = Ajv2020;
		module.exports = exports = Ajv2020;
		module.exports.Ajv2020 = Ajv2020;
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.default = Ajv2020;
		var validate_1 = requireValidate();
		Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function () { return validate_1.KeywordCxt; } });
		var codegen_1 = requireCodegen();
		Object.defineProperty(exports, "_", { enumerable: true, get: function () { return codegen_1._; } });
		Object.defineProperty(exports, "str", { enumerable: true, get: function () { return codegen_1.str; } });
		Object.defineProperty(exports, "stringify", { enumerable: true, get: function () { return codegen_1.stringify; } });
		Object.defineProperty(exports, "nil", { enumerable: true, get: function () { return codegen_1.nil; } });
		Object.defineProperty(exports, "Name", { enumerable: true, get: function () { return codegen_1.Name; } });
		Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function () { return codegen_1.CodeGen; } });
		var validation_error_1 = requireValidation_error();
		Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return validation_error_1.default; } });
		var ref_error_1 = requireRef_error();
		Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function () { return ref_error_1.default; } });
		
	} (_2020, _2020.exports));
	return _2020.exports;
}

var _2020Exports = require_2020();
var Ajv2020 = /*@__PURE__*/getDefaultExportFromCjs(_2020Exports);

var $schema = "https://json-schema.org/draft/2020-12/schema";
var $id = "https://github.com/brettinternet/stream-deck-hammerspoon/protocol/schema/protocol-v1.json";
var title = "Stream Deck–Hammerspoon protocol v1";
var description = "Canonical wire schema for authenticated Stream Deck–Hammerspoon messages.";
var oneOf = [
	{
		$ref: "#/$defs/hello"
	},
	{
		$ref: "#/$defs/helloAck"
	},
	{
		$ref: "#/$defs/listActions"
	},
	{
		$ref: "#/$defs/actions"
	},
	{
		$ref: "#/$defs/instanceAppeared"
	},
	{
		$ref: "#/$defs/instanceDisappeared"
	},
	{
		$ref: "#/$defs/keyDown"
	},
	{
		$ref: "#/$defs/keyUp"
	},
	{
		$ref: "#/$defs/dialDown"
	},
	{
		$ref: "#/$defs/dialRotate"
	},
	{
		$ref: "#/$defs/dialUp"
	},
	{
		$ref: "#/$defs/touchTap"
	},
	{
		$ref: "#/$defs/requestAppearance"
	},
	{
		$ref: "#/$defs/appearance"
	},
	{
		$ref: "#/$defs/feedback"
	},
	{
		$ref: "#/$defs/error"
	}
];
var $defs = {
	id: {
		type: "string",
		minLength: 1
	},
	sessionId: {
		type: "string",
		minLength: 1,
		description: "Opaque, non-empty server-generated identity for the current authenticated WebSocket session."
	},
	text: {
		type: "string",
		minLength: 1
	},
	descriptionText: {
		type: "string",
		minLength: 1,
		maxLength: 512,
		description: "Optional human-readable metadata bounded to 512 Unicode code points."
	},
	actionCategory: {
		type: "string",
		"enum": [
			"Applications",
			"Audio",
			"Productivity",
			"Windows",
			"System",
			"Media"
		]
	},
	settingsController: {
		type: "string",
		"enum": [
			"keypad",
			"encoder"
		]
	},
	settingsVisibility: {
		type: "object",
		properties: {
			key: {
				type: "string",
				minLength: 1,
				maxLength: 64
			},
			equals: {
				oneOf: [
					{
						type: "string"
					},
					{
						type: "number"
					},
					{
						type: "boolean"
					}
				]
			}
		},
		required: [
			"key",
			"equals"
		],
		additionalProperties: false
	},
	settings: {
		type: "object",
		description: "Application-owned JSON object. Keys and values are opaque to protocol v1.",
		additionalProperties: true
	},
	deviceMetadata: {
		type: "object",
		properties: {
			controllerType: {
				type: "string",
				"enum": [
					"keypad",
					"encoder"
				]
			},
			imageSize: {
				type: "integer",
				minimum: 1,
				maximum: 144
			},
			device: {
				type: "object",
				properties: {
					type: {
						type: "string",
						"enum": [
							"stream-deck",
							"stream-deck-mini",
							"stream-deck-xl",
							"stream-deck-mobile",
							"corsair-g-keys",
							"stream-deck-pedal",
							"corsair-voyager",
							"stream-deck-plus",
							"scuf-controller",
							"stream-deck-neo",
							"stream-deck-studio",
							"virtual-stream-deck",
							"galleon-100-sd",
							"stream-deck-plus-xl",
							"unknown"
						]
					},
					size: {
						type: "object",
						properties: {
							columns: {
								type: "integer",
								minimum: 1,
								maximum: 64
							},
							rows: {
								type: "integer",
								minimum: 1,
								maximum: 64
							}
						},
						required: [
							"columns",
							"rows"
						],
						additionalProperties: false
					}
				},
				required: [
					"type",
					"size"
				],
				additionalProperties: false
			}
		},
		required: [
			"controllerType",
			"device"
		],
		additionalProperties: false
	},
	settingsFieldBase: {
		type: "object",
		required: [
			"type",
			"key"
		],
		properties: {
			type: {
				type: "string",
				"enum": [
					"text",
					"number",
					"boolean",
					"select"
				]
			},
			key: {
				type: "string",
				minLength: 1,
				maxLength: 64
			},
			label: {
				type: "string",
				minLength: 1,
				maxLength: 128
			},
			description: {
				$ref: "#/$defs/descriptionText"
			},
			required: {
				type: "boolean"
			},
			"default": {
			},
			controllers: {
				type: "array",
				minItems: 1,
				maxItems: 2,
				uniqueItems: true,
				items: {
					$ref: "#/$defs/settingsController"
				}
			},
			visibleWhen: {
				$ref: "#/$defs/settingsVisibility"
			},
			section: {
				type: "string",
				minLength: 1,
				maxLength: 64
			}
		}
	},
	textSettingsField: {
		allOf: [
			{
				$ref: "#/$defs/settingsFieldBase"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "text"
					},
					"default": {
						type: "string"
					},
					minLength: {
						type: "integer",
						minimum: 0,
						maximum: 4096
					},
					maxLength: {
						type: "integer",
						minimum: 0,
						maximum: 4096
					}
				}
			}
		]
	},
	numberSettingsField: {
		allOf: [
			{
				$ref: "#/$defs/settingsFieldBase"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "number"
					},
					"default": {
						type: "number",
						minimum: -1e12,
						maximum: 1000000000000
					},
					min: {
						type: "number",
						minimum: -1e12,
						maximum: 1000000000000
					},
					max: {
						type: "number",
						minimum: -1e12,
						maximum: 1000000000000
					},
					step: {
						type: "number",
						exclusiveMinimum: 0,
						maximum: 1000000000000
					}
				}
			}
		]
	},
	booleanSettingsField: {
		allOf: [
			{
				$ref: "#/$defs/settingsFieldBase"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "boolean"
					},
					"default": {
						type: "boolean"
					}
				}
			}
		]
	},
	selectSettingsField: {
		allOf: [
			{
				$ref: "#/$defs/settingsFieldBase"
			},
			{
				type: "object",
				required: [
					"options"
				],
				properties: {
					type: {
						"const": "select"
					},
					"default": {
						type: "string"
					},
					refreshable: {
						type: "boolean"
					},
					options: {
						type: "array",
						minItems: 1,
						maxItems: 64,
						items: {
							type: "object",
							required: [
								"value",
								"label"
							],
							properties: {
								value: {
									type: "string",
									minLength: 1,
									maxLength: 256
								},
								label: {
									type: "string",
									minLength: 1,
									maxLength: 128
								}
							},
							additionalProperties: false
						}
					}
				}
			}
		]
	},
	settingsField: {
		type: "object",
		oneOf: [
			{
				$ref: "#/$defs/textSettingsField"
			},
			{
				$ref: "#/$defs/numberSettingsField"
			},
			{
				$ref: "#/$defs/booleanSettingsField"
			},
			{
				$ref: "#/$defs/selectSettingsField"
			}
		],
		unevaluatedProperties: false
	},
	message: {
		type: "object",
		required: [
			"protocolVersion",
			"type"
		],
		properties: {
			protocolVersion: {
				type: "integer",
				"const": 1
			},
			type: {
				type: "string",
				minLength: 1
			}
		},
		additionalProperties: true
	},
	hello: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "hello"
					},
					token: {
						$ref: "#/$defs/text"
					},
					pluginVersion: {
						$ref: "#/$defs/text"
					}
				},
				required: [
					"token",
					"pluginVersion"
				],
				additionalProperties: true
			}
		]
	},
	helloAck: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "helloAck"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					}
				},
				required: [
					"sessionId"
				],
				additionalProperties: true
			}
		]
	},
	listActions: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "listActions"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					requestId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"requestId"
				],
				additionalProperties: true
			}
		]
	},
	actionDefinition: {
		type: "object",
		properties: {
			actionId: {
				$ref: "#/$defs/id"
			},
			name: {
				$ref: "#/$defs/text"
			},
			description: {
				$ref: "#/$defs/descriptionText"
			},
			category: {
				$ref: "#/$defs/actionCategory"
			},
			gesture: {
				$ref: "#/$defs/descriptionText"
			},
			settingsSchema: {
				type: "array",
				maxItems: 32,
				items: {
				},
				description: "Optional bounded legacy field descriptors; explicit settingsSchemaVersion: 1 enables strict descriptor validation."
			},
			settingsSchemaVersion: {
				type: "integer",
				minimum: 1,
				maximum: 16
			}
		},
		required: [
			"actionId",
			"name"
		],
		allOf: [
			{
				"if": {
					required: [
						"settingsSchemaVersion"
					]
				},
				then: {
					required: [
						"settingsSchema"
					]
				}
			},
			{
				"if": {
					properties: {
						settingsSchemaVersion: {
							"const": 1
						}
					},
					required: [
						"settingsSchemaVersion"
					]
				},
				then: {
					properties: {
						settingsSchema: {
							type: "array",
							maxItems: 32,
							items: {
								$ref: "#/$defs/settingsField"
							}
						}
					}
				}
			}
		],
		additionalProperties: true
	},
	actions: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "actions"
					},
					requestId: {
						$ref: "#/$defs/id"
					},
					actions: {
						type: "array",
						items: {
							$ref: "#/$defs/actionDefinition"
						}
					}
				},
				required: [
					"requestId",
					"actions"
				],
				additionalProperties: true
			}
		]
	},
	instanceAppeared: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "instanceAppeared"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					},
					settings: {
						$ref: "#/$defs/settings"
					},
					metadata: {
						$ref: "#/$defs/deviceMetadata"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId",
					"settings"
				],
				additionalProperties: true
			}
		]
	},
	instanceDisappeared: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "instanceDisappeared"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	keyDown: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "keyDown"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	keyUp: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "keyUp"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	dialDown: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "dialDown"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	dialRotate: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "dialRotate"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					},
					ticks: {
						type: "integer"
					},
					pressed: {
						type: "boolean"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId",
					"ticks",
					"pressed"
				],
				additionalProperties: true
			}
		]
	},
	dialUp: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "dialUp"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	touchTap: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "touchTap"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					},
					hold: {
						type: "boolean"
					},
					tapPos: {
						type: "array",
						prefixItems: [
							{
								type: "number",
								minimum: 0,
								maximum: 800
							},
							{
								type: "number",
								minimum: 0,
								maximum: 100
							}
						],
						items: false,
						minItems: 2,
						maxItems: 2
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId",
					"hold",
					"tapPos"
				],
				additionalProperties: true
			}
		]
	},
	requestAppearance: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "requestAppearance"
					},
					sessionId: {
						$ref: "#/$defs/sessionId"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"sessionId",
					"instanceId",
					"actionId"
				],
				additionalProperties: true
			}
		]
	},
	appearanceColor: {
		type: "string",
		pattern: "^#[0-9A-Fa-f]{6}$"
	},
	appearanceBadge: {
		type: "string",
		maxLength: 4
	},
	appearanceValue: {
		type: "string",
		minLength: 1,
		maxLength: 16,
		pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F]*$"
	},
	appearanceIndicator: {
		type: "number",
		minimum: 0,
		maximum: 100
	},
	appearanceIcon: {
		oneOf: [
			{
				type: "object",
				properties: {
					kind: {
						"const": "bundled"
					},
					name: {
						type: "string",
						pattern: "^[a-z][a-z0-9-]{0,31}$"
					}
				},
				required: [
					"kind",
					"name"
				],
				additionalProperties: false
			},
			{
				type: "object",
				properties: {
					kind: {
						"const": "custom"
					},
					mediaType: {
						type: "string",
						"enum": [
							"image/png",
							"image/svg+xml"
						]
					},
					dataBase64: {
						type: "string",
						minLength: 4,
						maxLength: 43692,
						pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"
					}
				},
				required: [
					"kind",
					"mediaType",
					"dataBase64"
				],
				additionalProperties: false
			}
		]
	},
	appearance: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "appearance"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					},
					title: {
						type: "string"
					},
					state: {
						type: "integer",
						"enum": [
							0,
							1
						]
					},
					appearanceVersion: {
						"const": 1
					},
					presentationState: {
						type: "integer",
						minimum: 0,
						maximum: 3
					},
					foregroundColor: {
						$ref: "#/$defs/appearanceColor"
					},
					backgroundColor: {
						$ref: "#/$defs/appearanceColor"
					},
					progress: {
						type: "number",
						minimum: 0,
						maximum: 1
					},
					badge: {
						$ref: "#/$defs/appearanceBadge"
					},
					icon: {
						$ref: "#/$defs/appearanceIcon"
					},
					value: {
						$ref: "#/$defs/appearanceValue"
					},
					indicator: {
						$ref: "#/$defs/appearanceIndicator"
					}
				},
				required: [
					"instanceId",
					"actionId",
					"title",
					"state"
				],
				additionalProperties: true
			},
			{
				"if": {
					type: "object",
					anyOf: [
						{
							required: [
								"foregroundColor"
							]
						},
						{
							required: [
								"backgroundColor"
							]
						},
						{
							required: [
								"progress"
							]
						},
						{
							required: [
								"badge"
							]
						},
						{
							required: [
								"icon"
							]
						},
						{
							required: [
								"presentationState"
							]
						}
					]
				},
				then: {
					type: "object",
					required: [
						"appearanceVersion"
					]
				}
			},
			{
				"if": {
					type: "object",
					anyOf: [
						{
							required: [
								"value"
							]
						},
						{
							required: [
								"indicator"
							]
						}
					]
				},
				then: {
					type: "object",
					required: [
						"appearanceVersion",
						"value",
						"indicator"
					],
					not: {
						anyOf: [
							{
								required: [
									"foregroundColor"
								]
							},
							{
								required: [
									"backgroundColor"
								]
							},
							{
								required: [
									"progress"
								]
							},
							{
								required: [
									"badge"
								]
							}
						]
					}
				}
			}
		]
	},
	feedback: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "feedback"
					},
					instanceId: {
						$ref: "#/$defs/id"
					},
					actionId: {
						$ref: "#/$defs/id"
					},
					kind: {
						type: "string",
						"enum": [
							"success",
							"error"
						]
					},
					message: {
						$ref: "#/$defs/feedbackText"
					},
					durationMs: {
						type: "number",
						minimum: 100,
						maximum: 10000
					}
				},
				required: [
					"instanceId",
					"actionId",
					"kind",
					"message",
					"durationMs"
				],
				additionalProperties: true
			}
		]
	},
	feedbackText: {
		type: "string",
		minLength: 1,
		maxLength: 256,
		pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F]+$"
	},
	error: {
		allOf: [
			{
				$ref: "#/$defs/message"
			},
			{
				type: "object",
				properties: {
					type: {
						"const": "error"
					},
					code: {
						type: "string",
						"enum": [
							"AUTH_REQUIRED",
							"AUTH_FAILED",
							"VERSION_MISMATCH",
							"MALFORMED_MESSAGE",
							"UNKNOWN_TYPE",
							"INVALID_FIELD",
							"INVALID_STATE",
							"UNKNOWN_ACTION",
							"STALE_INSTANCE",
							"CALLBACK_FAILED",
							"INTERNAL"
						]
					},
					message: {
						$ref: "#/$defs/text"
					},
					requestId: {
						$ref: "#/$defs/id"
					},
					instanceId: {
						$ref: "#/$defs/id"
					}
				},
				required: [
					"code",
					"message"
				],
				additionalProperties: true
			}
		]
	}
};
var protocolSchema = {
	$schema: $schema,
	$id: $id,
	title: title,
	description: description,
	oneOf: oneOf,
	$defs: $defs
};

const PROTOCOL_VERSION = 1;
const TOUCH_TAP_CANVAS_WIDTH = 800;
const TOUCH_TAP_CANVAS_HEIGHT = 100;
const DEVICE_SIZE_MIN = 1;
const DEVICE_SIZE_MAX = 64;
const DEVICE_TYPE_VALUES = {
    "stream-deck": true,
    "stream-deck-mini": true,
    "stream-deck-xl": true,
    "stream-deck-mobile": true,
    "corsair-g-keys": true,
    "stream-deck-pedal": true,
    "corsair-voyager": true,
    "stream-deck-plus": true,
    "scuf-controller": true,
    "stream-deck-neo": true,
    "stream-deck-studio": true,
    "virtual-stream-deck": true,
    "galleon-100-sd": true,
    "stream-deck-plus-xl": true,
    unknown: true,
};
function isPlainObject(value) {
    if (!isObject(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function hasOnlyKeys(value, keys) {
    const allowed = new Set(keys);
    return Object.keys(value).every((key) => allowed.has(key));
}
function sanitizeDeviceMetadata(value) {
    if (!isPlainObject(value) || !hasOnlyKeys(value, ["controllerType", "imageSize", "device"]))
        return undefined;
    const controllerType = value.controllerType;
    const imageSize = value.imageSize;
    const device = value.device;
    if (imageSize !== undefined && (typeof imageSize !== "number" || !Number.isInteger(imageSize) || imageSize < 1 || imageSize > 144)) {
        return undefined;
    }
    if ((controllerType !== "keypad" && controllerType !== "encoder")
        || !isPlainObject(device)
        || !hasOnlyKeys(device, ["type", "size"])
        || typeof device.type !== "string"
        || !DEVICE_TYPE_VALUES[device.type]
        || !isPlainObject(device.size)
        || !hasOnlyKeys(device.size, ["columns", "rows"])
        || typeof device.size.columns !== "number"
        || !Number.isInteger(device.size.columns)
        || device.size.columns < DEVICE_SIZE_MIN
        || device.size.columns > DEVICE_SIZE_MAX
        || typeof device.size.rows !== "number"
        || !Number.isInteger(device.size.rows)
        || device.size.rows < DEVICE_SIZE_MIN
        || device.size.rows > DEVICE_SIZE_MAX) {
        return undefined;
    }
    return {
        controllerType,
        ...(typeof imageSize === "number" ? { imageSize } : {}),
        device: {
            type: device.type,
            size: { columns: device.size.columns, rows: device.size.rows },
        },
    };
}
function isSafeAppearanceValue(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    try {
        encodeURIComponent(value);
    }
    catch {
        return false;
    }
    let scalarValues = 0;
    for (const character of value) {
        scalarValues += 1;
        if (scalarValues > 16) {
            return false;
        }
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined
            && (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))) {
            return false;
        }
    }
    return true;
}
const CLIENT_MESSAGE_TYPES = {
    hello: true,
    listActions: true,
    instanceAppeared: true,
    instanceDisappeared: true,
    keyDown: true,
    keyUp: true,
    requestAppearance: true,
    dialDown: true,
    dialRotate: true,
    dialUp: true,
    touchTap: true,
};
const SERVER_MESSAGE_TYPES = {
    helloAck: true,
    actions: true,
    appearance: true,
    feedback: true,
    error: true,
};
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_LAN_CONTROL_BYTES = 4 * 1024;
const MAX_LAN_PAYLOAD_BYTES = 48 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_CONTAINER_ITEMS = 128;
const MAX_JSON_TOTAL_ITEMS = 2048;
const MAX_DESCRIPTION_LENGTH = 512;
function malformedJson(message = "Malformed protocol message.") {
    const error = new Error(message);
    error.code = "MALFORMED_MESSAGE";
    return error;
}
function jsonByteLength(value) {
    return Buffer.byteLength(value, "utf8");
}
/**
 * Scan JSON syntax and collection structure without constructing a value.
 * This is intentionally iterative: JSON.parse is called only after this
 * bounded scan accepts the frame.
 */
function preflightJson(source, maxBytes = MAX_FRAME_BYTES) {
    if (typeof source !== "string" || source.length === 0 || jsonByteLength(source) > maxBytes) {
        throw malformedJson();
    }
    let index = 0;
    let totalItems = 0;
    let rootDone = false;
    const stack = [];
    const fail = () => {
        throw malformedJson();
    };
    const skipWhitespace = () => {
        while (index < source.length) {
            const character = source[index];
            if (character !== " " && character !== "\t" && character !== "\r" && character !== "\n")
                break;
            index += 1;
        }
    };
    const isDelimiter = (character) => character === undefined || character === " " || character === "\t" || character === "\r"
        || character === "\n" || character === "," || character === "]" || character === "}";
    const parseString = () => {
        if (source[index] !== '"')
            fail();
        index += 1;
        while (index < source.length) {
            const character = source[index];
            index += 1;
            if (character === '"')
                return;
            if (character === undefined || character.charCodeAt(0) < 0x20)
                fail();
            if (character !== "\\")
                continue;
            const escape = source[index];
            index += 1;
            if (escape === "u") {
                for (let digit = 0; digit < 4; digit += 1) {
                    const code = source[index]?.charCodeAt(0);
                    if (code === undefined || !((code >= 0x30 && code <= 0x39)
                        || (code >= 0x41 && code <= 0x46)
                        || (code >= 0x61 && code <= 0x66)))
                        fail();
                    index += 1;
                }
            }
            else if (escape !== '"' && escape !== "\\" && escape !== "/" && escape !== "b"
                && escape !== "f" && escape !== "n" && escape !== "r" && escape !== "t") {
                fail();
            }
        }
        fail();
    };
    const parsePrimitive = () => {
        const character = source[index];
        if (character === '"') {
            parseString();
            return;
        }
        if (character === "t" && source.startsWith("true", index)) {
            index += 4;
        }
        else if (character === "f" && source.startsWith("false", index)) {
            index += 5;
        }
        else if (character === "n" && source.startsWith("null", index)) {
            index += 4;
        }
        else {
            const start = index;
            if (source[index] === "-")
                index += 1;
            if (source[index] === "0") {
                index += 1;
            }
            else if (source[index] !== undefined && source[index] >= "1" && source[index] <= "9") {
                index += 1;
                while (source[index] !== undefined && source[index] >= "0" && source[index] <= "9")
                    index += 1;
            }
            else {
                fail();
            }
            if (source[index] === ".") {
                index += 1;
                const fractionStart = index;
                while (source[index] !== undefined && source[index] >= "0" && source[index] <= "9")
                    index += 1;
                if (index === fractionStart)
                    fail();
            }
            if (source[index] === "e" || source[index] === "E") {
                index += 1;
                if (source[index] === "+" || source[index] === "-")
                    index += 1;
                const exponentStart = index;
                while (source[index] !== undefined && source[index] >= "0" && source[index] <= "9")
                    index += 1;
                if (index === exponentStart)
                    fail();
            }
            if (index === start)
                fail();
        }
        if (!isDelimiter(source[index]))
            fail();
    };
    const beginValue = () => {
        const parent = stack.at(-1);
        if (parent) {
            if (parent.kind === "object") {
                if (parent.state !== "value")
                    fail();
                parent.state = "commaOrEnd";
            }
            else {
                if (parent.state !== "valueOrEnd" && parent.state !== "arrayValue")
                    fail();
                parent.state = "commaOrEnd";
                parent.count += 1;
                totalItems += 1;
            }
            if (parent.count > MAX_JSON_CONTAINER_ITEMS || totalItems > MAX_JSON_TOTAL_ITEMS)
                fail();
        }
        const character = source[index];
        if (character === "{" || character === "[") {
            if (stack.length >= MAX_JSON_DEPTH)
                fail();
            index += 1;
            stack.push({
                kind: character === "{" ? "object" : "array",
                state: character === "{" ? "keyOrEnd" : "valueOrEnd",
                count: 0,
            });
            return;
        }
        parsePrimitive();
        if (stack.length === 0)
            rootDone = true;
    };
    while (!rootDone) {
        skipWhitespace();
        if (stack.length === 0) {
            beginValue();
            continue;
        }
        const container = stack.at(-1);
        if (container.kind === "object") {
            if (container.state === "keyOrEnd" || container.state === "key") {
                if (container.state === "keyOrEnd" && source[index] === "}") {
                    index += 1;
                    stack.pop();
                    if (stack.length === 0)
                        rootDone = true;
                }
                else {
                    parseString();
                    container.count += 1;
                    totalItems += 1;
                    if (container.count > MAX_JSON_CONTAINER_ITEMS || totalItems > MAX_JSON_TOTAL_ITEMS)
                        fail();
                    container.state = "colon";
                }
            }
            else if (container.state === "colon") {
                if (source[index] !== ":")
                    fail();
                index += 1;
                container.state = "value";
            }
            else if (container.state === "value") {
                beginValue();
            }
            else {
                if (source[index] === ",") {
                    index += 1;
                    container.state = "key";
                }
                else if (source[index] === "}") {
                    index += 1;
                    stack.pop();
                    if (stack.length === 0)
                        rootDone = true;
                }
                else {
                    fail();
                }
            }
        }
        else if (container.state === "valueOrEnd" && source[index] === "]") {
            index += 1;
            stack.pop();
            if (stack.length === 0)
                rootDone = true;
        }
        else if (container.state === "valueOrEnd" || container.state === "arrayValue") {
            beginValue();
        }
        else {
            if (source[index] === ",") {
                index += 1;
                container.state = "arrayValue";
            }
            else if (source[index] === "]") {
                index += 1;
                stack.pop();
                if (stack.length === 0)
                    rootDone = true;
            }
            else {
                fail();
            }
        }
    }
    skipWhitespace();
    if (index !== source.length)
        fail();
}
const ajv = new Ajv2020({ allErrors: true });
const validateProtocolMessage = ajv.compile(protocolSchema);
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isJsonValue(value, seen = new Set()) {
    if (value === null) {
        return true;
    }
    switch (typeof value) {
        case "string":
        case "boolean":
            return true;
        case "number":
            return Number.isFinite(value);
        case "object": {
            if (seen.has(value)) {
                return false;
            }
            seen.add(value);
            const valid = Array.isArray(value)
                ? value.every((item) => isJsonValue(item, seen))
                : Object.values(value).every((item) => isJsonValue(item, seen));
            seen.delete(value);
            return valid;
        }
        default:
            return false;
    }
}
function hasDuplicateObjectKeys(source) {
    let index = 0;
    const skipWhitespace = () => {
        while (index < source.length && /\s/.test(source[index] ?? "")) {
            index += 1;
        }
    };
    const skipString = () => {
        const start = index;
        index += 1;
        while (index < source.length) {
            const character = source[index];
            index += 1;
            if (character === "\\") {
                index += 1;
            }
            else if (character === '"') {
                break;
            }
        }
        return source.slice(start, index);
    };
    const scanValue = () => {
        skipWhitespace();
        const character = source[index];
        if (character === "{") {
            index += 1;
            skipWhitespace();
            const keys = new Set();
            if (source[index] === "}") {
                index += 1;
                return false;
            }
            while (index < source.length) {
                skipWhitespace();
                const encodedKey = skipString();
                const key = JSON.parse(encodedKey);
                if (keys.has(key)) {
                    return true;
                }
                keys.add(key);
                skipWhitespace();
                index += 1;
                if (scanValue()) {
                    return true;
                }
                skipWhitespace();
                if (source[index] === "}") {
                    index += 1;
                    return false;
                }
                index += 1;
            }
            return false;
        }
        if (character === "[") {
            index += 1;
            skipWhitespace();
            if (source[index] === "]") {
                index += 1;
                return false;
            }
            while (index < source.length) {
                if (scanValue()) {
                    return true;
                }
                skipWhitespace();
                if (source[index] === "]") {
                    index += 1;
                    return false;
                }
                index += 1;
            }
            return false;
        }
        if (character === '"') {
            skipString();
            return false;
        }
        while (index < source.length && !/[\s,}\]]/.test(source[index] ?? "")) {
            index += 1;
        }
        return false;
    };
    return scanValue();
}
function settingsSchemaError(actionIndex, fieldIndex, message) {
    return new Error(`Invalid server message: settingsSchema action ${actionIndex} field ${fieldIndex}: ${message}.`);
}
function stringLength(value) {
    let length = 0;
    for (const character of value) {
        length += character.length > 0 ? 1 : 0;
    }
    return length;
}
function isBoundedDescription(value) {
    if (value === undefined)
        return true;
    if (typeof value !== "string")
        return false;
    const length = stringLength(value);
    return length >= 1 && length <= MAX_DESCRIPTION_LENGTH;
}
function validateSettingsSchema(action, actionIndex) {
    if (action.settingsSchemaVersion !== 1) {
        return;
    }
    const fields = action.settingsSchema;
    if (!fields) {
        throw settingsSchemaError(actionIndex, 0, "settingsSchemaVersion requires settingsSchema");
    }
    const keys = new Set();
    fields.forEach((field, fieldIndex) => {
        if (keys.has(field.key)) {
            throw settingsSchemaError(actionIndex, fieldIndex, `duplicate key "${field.key}"`);
        }
        keys.add(field.key);
        if (!isBoundedDescription(field.description)) {
            throw settingsSchemaError(actionIndex, fieldIndex, "description must be non-empty and at most 512 Unicode code points");
        }
        if (field.controllers !== undefined &&
            (new Set(field.controllers).size !== field.controllers.length)) {
            throw settingsSchemaError(actionIndex, fieldIndex, "controllers must not contain duplicates");
        }
        if (field.visibleWhen !== undefined && field.visibleWhen.key === field.key) {
            throw settingsSchemaError(actionIndex, fieldIndex, "visibleWhen must reference another field");
        }
        if (field.type !== "select" && "refreshable" in field) {
            throw settingsSchemaError(actionIndex, fieldIndex, "refreshable is only valid for select fields");
        }
        if (field.type === "text") {
            if (field.minLength !== undefined &&
                field.maxLength !== undefined &&
                field.minLength > field.maxLength) {
                throw settingsSchemaError(actionIndex, fieldIndex, "minLength must not exceed maxLength");
            }
            if (field.default !== undefined &&
                ((field.minLength !== undefined && stringLength(field.default) < field.minLength) ||
                    (field.maxLength !== undefined && stringLength(field.default) > field.maxLength))) {
                throw settingsSchemaError(actionIndex, fieldIndex, "default is outside the text length bounds");
            }
        }
        else if (field.type === "number") {
            if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
                throw settingsSchemaError(actionIndex, fieldIndex, "min must not exceed max");
            }
            if (field.default !== undefined &&
                ((field.min !== undefined && field.default < field.min) ||
                    (field.max !== undefined && field.default > field.max))) {
                throw settingsSchemaError(actionIndex, fieldIndex, "default is outside the number bounds");
            }
        }
        else if (field.type === "select") {
            const optionValues = new Set();
            for (const option of field.options) {
                if (optionValues.has(option.value)) {
                    throw settingsSchemaError(actionIndex, fieldIndex, `duplicate select option "${option.value}"`);
                }
                optionValues.add(option.value);
            }
            if (field.default !== undefined && !optionValues.has(field.default)) {
                throw settingsSchemaError(actionIndex, fieldIndex, "default must match a select option");
            }
        }
        else if (field.type === "boolean") ;
    });
    fields.forEach((field, fieldIndex) => {
        if (field.visibleWhen !== undefined && !keys.has(field.visibleWhen.key)) {
            throw settingsSchemaError(actionIndex, fieldIndex, `visibleWhen references unknown key "${field.visibleWhen.key}"`);
        }
    });
}
function validateFeedback(message) {
    if (stringLength(message.message) > 256) {
        throw new Error("Invalid server message: feedback message exceeds 256 characters.");
    }
    for (const character of message.message) {
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined &&
            ((codePoint >= 0 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f))) {
            throw new Error("Invalid server message: feedback message contains control characters.");
        }
    }
    try {
        encodeURIComponent(message.message);
    }
    catch {
        throw new Error("Invalid server message: feedback message must contain valid Unicode.");
    }
}
const MAX_ICON_BYTES = 32768;
const MAX_ICON_BASE64_LENGTH = 43692;
const MAX_SVG_LENGTH = 16384;
const SVG_ELEMENTS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const SVG_ATTRIBUTES = new Set([
    "xmlns", "viewBox", "width", "height", "fill", "stroke", "stroke-width", "opacity",
    "fill-opacity", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
    "fill-rule", "clip-rule", "d", "points", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
]);
const SVG_NUMERIC_ATTRIBUTES = new Set([
    "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "stroke-miterlimit",
    "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height",
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICON_SIZES = {
    48: true,
    72: true,
    80: true,
    96: true,
    120: true,
    144: true,
};
function isIconSize(value) {
    return ICON_SIZES[value] === true;
}
function isCanonicalBase64(value) {
    return value.length >= 4
        && value.length <= MAX_ICON_BASE64_LENGTH
        && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
        && Buffer.from(value, "base64").toString("base64") === value;
}
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc & 1) === 0 ? crc >>> 1 : (crc >>> 1) ^ 0xedb88320;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function isValidPng(bytes) {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return false;
    }
    let offset = 8;
    let hasHeader = false;
    let hasData = false;
    let expectedRawLength = 0;
    let rowLength = 0;
    const idatParts = [];
    while (offset < bytes.length) {
        if (offset + 12 > bytes.length) {
            return false;
        }
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        const end = offset + 12 + length;
        if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length
            || crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
            return false;
        }
        if (!hasHeader) {
            if (type !== "IHDR" || length !== 13) {
                return false;
            }
            const width = bytes.readUInt32BE(offset + 8);
            const height = bytes.readUInt32BE(offset + 12);
            const bitDepth = bytes[offset + 16];
            const colorType = bytes[offset + 17];
            const bytesPerPixel = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
            if (width !== height || !isIconSize(width) || bitDepth !== 8
                || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0
                || bytesPerPixel === undefined) {
                return false;
            }
            rowLength = width * bytesPerPixel + 1;
            expectedRawLength = height * rowLength;
            hasHeader = true;
        }
        if (type === "acTL") {
            return false;
        }
        if (type === "IDAT") {
            if (length === 0) {
                return false;
            }
            idatParts.push(bytes.subarray(offset + 8, offset + 8 + length));
            hasData = true;
        }
        if (type === "IEND") {
            if (!hasHeader || !hasData || length !== 0 || end !== bytes.length) {
                return false;
            }
            try {
                const compressed = Buffer.concat(idatParts);
                const inflated = inflateSync(compressed, { info: true, maxOutputLength: expectedRawLength });
                if (inflated.engine.bytesWritten !== compressed.length) {
                    return false;
                }
                const raw = inflated.buffer;
                if (raw.length !== expectedRawLength) {
                    return false;
                }
                for (let row = 0; row < raw.length; row += rowLength) {
                    if (raw[row] > 4) {
                        return false;
                    }
                }
                return true;
            }
            catch {
                return false;
            }
        }
        offset = end;
    }
    return false;
}
function isSvgNumber(value) {
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
        && Number.isFinite(Number(value))
        && Math.abs(Number(value)) <= 1000000;
}
function isSvgAttributeValue(name, value, rootSize) {
    // eslint-disable-next-line no-control-regex -- reject control characters in untrusted SVG attributes
    if (value.length > 4096 || /[<&>\u0000-\u001f\u007f-\u009f]/.test(value)) {
        return false;
    }
    if (name === "xmlns") {
        return value === "http://www.w3.org/2000/svg";
    }
    if (name === "viewBox") {
        return value === `0 0 ${rootSize ?? 0} ${rootSize ?? 0}`;
    }
    if (name === "width" || name === "height") {
        return rootSize !== undefined ? value === String(rootSize) : isSvgNumber(value) && Number(value) >= 0;
    }
    if (name === "fill" || name === "stroke") {
        return value === "none" || /^#[0-9A-Fa-f]{6}$/.test(value);
    }
    if (name === "stroke-linecap") {
        return value === "butt" || value === "round" || value === "square";
    }
    if (name === "stroke-linejoin") {
        return value === "miter" || value === "round" || value === "bevel";
    }
    if (name === "fill-rule" || name === "clip-rule") {
        return value === "nonzero" || value === "evenodd";
    }
    if (SVG_NUMERIC_ATTRIBUTES.has(name)) {
        return isSvgNumber(value) && Number(value) >= 0;
    }
    if (name === "d" || name === "points") {
        return /^[A-Za-z0-9.,+\- \t\r\n]+$/.test(value);
    }
    return false;
}
function parseSvgTag(source) {
    let body = source.trim();
    const selfClosing = body.endsWith("/");
    if (selfClosing) {
        body = body.slice(0, -1).trim();
    }
    const nameMatch = body.match(/^([a-z][a-z0-9-]*)\b/);
    if (!nameMatch) {
        return undefined;
    }
    const name = nameMatch[1];
    const attributes = new Map();
    let rest = body.slice(name.length).trim();
    while (rest.length > 0) {
        const attributeMatch = rest.match(/^([A-Za-z][A-Za-z0-9-]*)\s*=\s*/);
        if (!attributeMatch) {
            return undefined;
        }
        const attribute = attributeMatch[1];
        if (attributes.has(attribute) || !SVG_ATTRIBUTES.has(attribute)) {
            return undefined;
        }
        rest = rest.slice(attributeMatch[0].length);
        const quote = rest[0];
        if (quote !== '"' && quote !== "'") {
            return undefined;
        }
        const end = rest.indexOf(quote, 1);
        if (end < 0) {
            return undefined;
        }
        attributes.set(attribute, rest.slice(1, end));
        rest = rest.slice(end + 1).trim();
    }
    return { name, attributes, selfClosing };
}
function sanitizeSvg(value) {
    if (value.length === 0 || value.length > MAX_SVG_LENGTH) {
        return undefined;
    }
    let svg;
    try {
        svg = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value));
    }
    catch {
        return undefined;
    }
    // eslint-disable-next-line no-control-regex -- reject control characters in untrusted SVG input
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(svg)) {
        return undefined;
    }
    const tags = /<([^<>]*)>/g;
    const stack = [];
    const output = [];
    let cursor = 0;
    let elementCount = 0;
    let rootSize;
    let rootSeen = false;
    let match;
    while ((match = tags.exec(svg)) !== null) {
        if (svg.slice(cursor, match.index).trim() !== "") {
            return undefined;
        }
        cursor = tags.lastIndex;
        const body = match[1].trim();
        if (body.startsWith("!") || body.startsWith("?") || body.startsWith("/")) {
            if (!body.startsWith("/")) {
                return undefined;
            }
            const closingName = body.slice(1).trim();
            if (!/^[a-z][a-z0-9-]*$/.test(closingName) || stack.at(-1) !== closingName) {
                return undefined;
            }
            stack.pop();
            output.push(`</${closingName}>`);
            continue;
        }
        const parsed = parseSvgTag(body);
        if (!parsed || !SVG_ELEMENTS.has(parsed.name) || (parsed.name === "svg" && rootSeen)) {
            return undefined;
        }
        if (!rootSeen && parsed.name !== "svg") {
            return undefined;
        }
        elementCount += 1;
        if (elementCount > 128 || stack.length >= 16) {
            return undefined;
        }
        if (parsed.name === "svg") {
            const viewBoxMatch = /^0 0 (48|72|80|96|120|144) \1$/.exec(parsed.attributes.get("viewBox") ?? "");
            const size = viewBoxMatch === null ? undefined : Number(viewBoxMatch[1]);
            if (parsed.attributes.get("xmlns") !== "http://www.w3.org/2000/svg" || size === undefined) {
                return undefined;
            }
            if ((parsed.attributes.get("width") !== undefined && parsed.attributes.get("width") !== String(size)) ||
                (parsed.attributes.get("height") !== undefined && parsed.attributes.get("height") !== String(size))) {
                return undefined;
            }
            rootSize = size;
            rootSeen = true;
        }
        for (const [name, attributeValue] of parsed.attributes) {
            if (!isSvgAttributeValue(name, attributeValue, parsed.name === "svg" ? rootSize : undefined)) {
                return undefined;
            }
        }
        const serializedAttributes = [...parsed.attributes]
            .map(([name, attributeValue]) => `${name}="${attributeValue.replace(/["']/g, (character) => character === '"' ? "&quot;" : "&apos;")}"`)
            .join(" ");
        output.push(`<${parsed.name}${serializedAttributes.length > 0 ? ` ${serializedAttributes}` : ""}${parsed.selfClosing ? "/>" : ">"}`);
        if (!parsed.selfClosing) {
            stack.push(parsed.name);
        }
    }
    return cursor === svg.length && rootSeen && stack.length === 0 ? output.join("") : undefined;
}
function isSafeAppearanceIcon(value) {
    if (!isObject(value)) {
        return false;
    }
    if (value.kind === "bundled") {
        return typeof value.name === "string"
            && /^[a-z][a-z0-9-]{0,31}$/.test(value.name)
            && Object.keys(value).every((key) => key === "kind" || key === "name");
    }
    if (value.kind !== "custom" ||
        (value.mediaType !== "image/png" && value.mediaType !== "image/svg+xml") ||
        typeof value.dataBase64 !== "string" ||
        !isCanonicalBase64(value.dataBase64) ||
        Object.keys(value).some((key) => !["kind", "mediaType", "dataBase64"].includes(key))) {
        return false;
    }
    const bytes = Buffer.from(value.dataBase64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
        return false;
    }
    return value.mediaType === "image/png" ? isValidPng(bytes) : sanitizeSvg(bytes.toString("utf8")) !== undefined;
}
function safeAppearanceIconImage(value) {
    if (!isSafeAppearanceIcon(value)) {
        return undefined;
    }
    if (value.kind === "bundled") {
        return undefined;
    }
    const bytes = Buffer.from(value.dataBase64, "base64");
    if (value.mediaType === "image/png") {
        return `data:${value.mediaType};base64,${value.dataBase64}`;
    }
    const sanitized = sanitizeSvg(bytes.toString("utf8"));
    return sanitized === undefined ? undefined : `data:image/svg+xml,${encodeURIComponent(sanitized)}`;
}
function schemaError(direction) {
    const details = ajv.errorsText(validateProtocolMessage.errors, { separator: "; " });
    return new Error(`Invalid ${direction} message: failed protocol schema validation${details ? `: ${details}` : ""}.`);
}
function classifyServerType(type) {
    if (typeof type !== "string") {
        throw new Error("Invalid server message: missing message type.");
    }
    if (Object.hasOwn(CLIENT_MESSAGE_TYPES, type)) {
        throw new Error("Invalid server message: received a plugin-to-Lua message.");
    }
    if (!Object.hasOwn(SERVER_MESSAGE_TYPES, type)) {
        throw new Error("Invalid server message: unknown message type.");
    }
}
function classifyClientType(type) {
    if (typeof type !== "string") {
        throw new Error("Invalid client message: missing message type.");
    }
    if (Object.hasOwn(SERVER_MESSAGE_TYPES, type)) {
        throw new Error("Invalid client message: received a Lua-to-plugin message.");
    }
    if (!Object.hasOwn(CLIENT_MESSAGE_TYPES, type)) {
        throw new Error("Invalid client message: unknown message type.");
    }
}
function parseServerMessage(data) {
    if (data.length === 0) {
        throw new Error("Cannot parse server message: empty frame.");
    }
    preflightJson(data);
    let parsed;
    try {
        parsed = JSON.parse(data);
    }
    catch {
        throw malformedJson("Cannot parse server message: invalid JSON.");
    }
    if (!isObject(parsed)) {
        throw new Error("Invalid server message: expected a JSON object.");
    }
    classifyServerType(parsed.type);
    if (hasDuplicateObjectKeys(data)) {
        throw new Error("Invalid server message: duplicate object fields are not allowed.");
    }
    if (!validateProtocolMessage(parsed)) {
        throw schemaError("server");
    }
    if (parsed.type === "appearance") {
        const hasValue = parsed.value !== undefined;
        const hasIndicator = parsed.indicator !== undefined;
        if (hasValue !== hasIndicator) {
            throw new Error("Invalid server message: appearance value and indicator must be provided together.");
        }
        if (hasValue) {
            if (!isSafeAppearanceValue(parsed.value)) {
                throw new Error("Invalid server message: appearance value is empty, unsafe, invalid Unicode, or too long.");
            }
            if (typeof parsed.indicator !== "number"
                || !Number.isFinite(parsed.indicator)
                || parsed.indicator < 0
                || parsed.indicator > 100) {
                throw new Error("Invalid server message: appearance indicator must be finite and between 0 and 100.");
            }
            if (parsed.foregroundColor !== undefined
                || parsed.backgroundColor !== undefined
                || parsed.progress !== undefined
                || parsed.badge !== undefined) {
                throw new Error("Invalid server message: appearance value/indicator cannot use v1 decorations.");
            }
        }
    }
    if (parsed.type === "appearance" && parsed.badge !== undefined) {
        for (const character of parsed.badge) {
            const codePoint = character.codePointAt(0);
            if (codePoint !== undefined &&
                (codePoint <= 0x08 || (codePoint >= 0x0b && codePoint <= 0x0c) || (codePoint >= 0x0e && codePoint <= 0x1f))) {
                throw new Error("Invalid server message: badge contains XML-invalid control characters.");
            }
        }
        try {
            encodeURIComponent(parsed.badge);
        }
        catch {
            throw new Error("Invalid server message: badge must contain valid Unicode.");
        }
    }
    if (parsed.type === "appearance" && parsed.icon !== undefined && !isSafeAppearanceIcon(parsed.icon)) {
        throw new Error("Invalid server message: icon is unsupported, malformed, oversized, or unsafe.");
    }
    if (parsed.type === "actions") {
        const actions = parsed.actions;
        const actionIds = new Set();
        for (const [index, action] of actions.entries()) {
            if (!isBoundedDescription(action.description)) {
                throw new Error(`Invalid server message: action ${index} description must be non-empty and at most 512 Unicode code points.`);
            }
            if (action.category !== undefined &&
                !["Applications", "Audio", "Productivity", "Windows", "System", "Media"].includes(action.category)) {
                throw new Error(`Invalid server message: action ${index} category is unsupported.`);
            }
            if (!isBoundedDescription(action.gesture)) {
                throw new Error(`Invalid server message: action ${index} gesture must be non-empty and at most 512 Unicode code points.`);
            }
            validateSettingsSchema(action, index);
            if (actionIds.has(action.actionId)) {
                throw new Error("Invalid server message: duplicate action IDs are not allowed.");
            }
            actionIds.add(action.actionId);
        }
    }
    if (parsed.type === "feedback") {
        validateFeedback(parsed);
    }
    return parsed;
}
function serializeClientMessage(message) {
    if (!isObject(message)) {
        throw new Error("Invalid client message: expected a JSON object.");
    }
    classifyClientType(message.type);
    if (!validateProtocolMessage(message)) {
        throw schemaError("client");
    }
    if (message.type === "instanceAppeared") {
        if (!isJsonValue(message.settings)) {
            throw new Error("Invalid client message: settings must contain JSON values.");
        }
        if (message.metadata !== undefined && sanitizeDeviceMetadata(message.metadata) === undefined) {
            throw new Error("Invalid client message: metadata is malformed or out of bounds.");
        }
    }
    try {
        const encoded = JSON.stringify(message);
        if (encoded === undefined) {
            throw new Error("not JSON");
        }
        if (jsonByteLength(encoded) > MAX_FRAME_BYTES) {
            throw malformedJson("Invalid client message: frame exceeds 65536 UTF-8 bytes.");
        }
        return encoded;
    }
    catch (error) {
        if (error instanceof Error && error.message.includes("frame exceeds"))
            throw error;
        throw new Error("Invalid client message: value is not JSON-serializable.");
    }
}

const LAN_FRAME_TYPE = "lanFrame";
const LAN_HELLO_TYPE = "lanHello";
const LAN_CHALLENGE_TYPE = "lanChallenge";
const LAN_PROOF_TYPE = "lanProof";
const LAN_READY_TYPE = "lanReady";
const LAN_CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const UNAUTH_RATE_BURST = 6;
const UNAUTH_RATE_REFILL_PER_MS = 12 / 60_000;
const AUTH_RATE_BURST = 240;
const AUTH_RATE_REFILL_PER_MS = 120 / 1_000;
function isLanUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "ws:" && parsed.hostname !== "localhost"
            && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]"
            && parsed.pathname === "/streamdeck";
    }
    catch {
        return false;
    }
}
async function readLanKeyFile(path) {
    const attributes = await stat(path);
    if (!attributes.isFile() || (attributes.mode & 0o777) !== 0o600) {
        throw new Error("LAN credential permissions are unsafe.");
    }
    return readFile(path);
}
const DEFAULT_URL = "ws://localhost:17321/streamdeck";
const DEFAULT_TOKEN_PATH = join(homedir(), ".hammerspoon", "streamdeck-token");
const INITIAL_RECONNECT_MS = 250;
const MAX_RECONNECT_MS = 10_000;
const SOCKET_HANDSHAKE_TIMEOUT_MS = 5_000;
function isNonEmptyString(value) {
    return typeof value === "string" && value.length > 0;
}
function copyJsonValue(value) {
    if (Array.isArray(value)) {
        return value.map(copyJsonValue);
    }
    if (value !== null && typeof value === "object") {
        const copied = {};
        for (const [key, nested] of Object.entries(value)) {
            copied[key] = copyJsonValue(nested);
        }
        return copied;
    }
    return value;
}
function copySettings(settings) {
    const copied = {};
    for (const [key, value] of Object.entries(settings)) {
        copied[key] = copyJsonValue(value);
    }
    return copied;
}
function copyDeviceMetadata(metadata) {
    return {
        controllerType: metadata.controllerType,
        ...(metadata.imageSize === undefined ? {} : { imageSize: metadata.imageSize }),
        device: {
            type: metadata.device.type,
            size: { columns: metadata.device.size.columns, rows: metadata.device.size.rows },
        },
    };
}
function copyAction(action) {
    return {
        actionId: action.actionId,
        name: action.name,
        ...(action.description === undefined ? {} : { description: action.description }),
        ...(action.category === undefined ? {} : { category: action.category }),
        ...(action.gesture === undefined ? {} : { gesture: action.gesture }),
        ...(action.settingsSchema === undefined
            ? {}
            : { settingsSchema: action.settingsSchema.map(copyJsonValue) }),
        ...(action.settingsSchemaVersion === undefined ? {} : { settingsSchemaVersion: action.settingsSchemaVersion }),
    };
}
function frameToString(data) {
    if (typeof data === "string")
        return data;
    if (Buffer.isBuffer(data))
        return data.toString("utf8");
    if (data instanceof ArrayBuffer)
        return Buffer.from(data).toString("utf8");
    if (ArrayBuffer.isView(data))
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    return String(data);
}
const SAFE_PROTOCOL_MESSAGES = {
    AUTH_REQUIRED: "Authentication is required.",
    AUTH_FAILED: "Authentication failed.",
    VERSION_MISMATCH: "Protocol version mismatch.",
    MALFORMED_MESSAGE: "Malformed protocol message.",
    UNKNOWN_TYPE: "Unknown protocol message type.",
    INVALID_FIELD: "Invalid protocol field.",
    INVALID_STATE: "Invalid protocol state.",
    UNKNOWN_ACTION: "Unknown action.",
    STALE_INSTANCE: "Stale instance.",
    CALLBACK_FAILED: "Action callback failed.",
    INTERNAL: "Internal server error.",
};
const MAX_DIAGNOSTIC_LINE = 384;
function safeProtocolCode(value) {
    return typeof value === "string" && Object.hasOwn(SAFE_PROTOCOL_MESSAGES, value)
        ? value
        : "MALFORMED_MESSAGE";
}
function diagnosticCategory(code, hasInstance = false) {
    if (code === "AUTH_REQUIRED" || code === "AUTH_FAILED" || code === "TOKEN_UNAVAILABLE" || code === "LAN_KEY_UNAVAILABLE")
        return "auth";
    if (code === "UNKNOWN_ACTION" || code === "STALE_INSTANCE" || code === "INVALID_STATE")
        return "registry";
    if (code === "CALLBACK_FAILED" || (code === "INTERNAL" && hasInstance))
        return "callback";
    if (code === "SOCKET_FAILED" || code === "DISCONNECTED" || code === "RECONNECTING")
        return "reconnect";
    return "schema";
}
function sanitizePluginVersion(value) {
    const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32);
    return sanitized || "unknown";
}
function portFromUrl(value) {
    try {
        const parsed = new URL(value);
        const port = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
        return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 17321;
    }
    catch {
        return 17321;
    }
}
const LEGACY_LOOPBACK_URL = /^ws:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
function isLegacyLoopbackUrl(value) {
    if (!LEGACY_LOOPBACK_URL.test(value))
        return false;
    try {
        new URL(value);
        return true;
    }
    catch {
        return false;
    }
}
function safeError(error) {
    let candidateCode;
    if (error !== null && typeof error === "object" && "code" in error) {
        candidateCode = error.code;
    }
    const code = safeProtocolCode(candidateCode);
    return { code, message: SAFE_PROTOCOL_MESSAGES[code] };
}
class BridgeClient extends EventEmitter$1 {
    url;
    tokenPath;
    pluginVersion;
    lan;
    _status = "disconnected";
    _actions = [];
    instances = new Map();
    createSocket;
    readToken;
    readKey;
    randomBytes;
    scheduleTimeout;
    cancelTimeout;
    random;
    now;
    logger;
    port;
    safePluginVersion;
    socket;
    socketGeneration = 0;
    handshakeTimer;
    reconnectTimer;
    reconnectAttempt = 0;
    started = false;
    authenticated = false;
    sessionId;
    nextRequestId = 0;
    pendingActions = new Set();
    latestDiagnostic;
    retryInMs;
    loggedDiagnosticKeys = new Set();
    inboundUnauthRate = { tokens: UNAUTH_RATE_BURST, atMs: undefined };
    inboundAuthRate = { tokens: AUTH_RATE_BURST, atMs: undefined };
    preserveFailureCause = false;
    lanPhase;
    lanKey;
    lanClientNonce;
    lanServerNonce;
    lanSendKey;
    lanReceiveKey;
    lanSendSequence = 0;
    lanReceiveSequence = 0;
    constructor(options) {
        super();
        this.url = options.url ?? DEFAULT_URL;
        this.lan = options.lan;
        if (this.lan) {
            if (!isLanUrl(this.url))
                throw new Error("LAN bridge URL must use ws://<host>/streamdeck.");
            if (typeof this.lan.clientId !== "string" || !LAN_CLIENT_ID_PATTERN.test(this.lan.clientId)) {
                throw new Error("LAN clientId must use 1-64 safe characters.");
            }
            if (!isNonEmptyString(this.lan.keyPath))
                throw new Error("LAN keyPath must be a non-empty string.");
        }
        else if (!isLegacyLoopbackUrl(this.url)) {
            throw new Error("Legacy bridge URL must target loopback.");
        }
        this.tokenPath = options.tokenPath ?? DEFAULT_TOKEN_PATH;
        this.pluginVersion = options.pluginVersion;
        this.safePluginVersion = sanitizePluginVersion(options.pluginVersion);
        this.port = portFromUrl(this.url);
        this.now = options.now ?? (() => new Date());
        this.logger = options.logger ?? (() => { });
        this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
        this.readToken = options.readToken ?? ((tokenPath) => readFile(tokenPath, "utf8"));
        this.readKey = options.readKey ?? readLanKeyFile;
        this.randomBytes = options.randomBytes ?? randomBytes;
        this.scheduleTimeout = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
        this.cancelTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle));
        this.random = options.random ?? Math.random;
    }
    get status() {
        return this._status;
    }
    get actions() {
        return this._actions.map(copyAction);
    }
    get diagnostics() {
        const status = {
            version: 1,
            status: this._status,
            protocolVersion: PROTOCOL_VERSION,
            pluginVersion: this.safePluginVersion,
            port: this.port,
            ...(this.retryInMs === undefined ? {} : { retryInMs: this.retryInMs }),
            ...(this.latestDiagnostic === undefined ? {} : { latest: { ...this.latestDiagnostic } }),
        };
        return status;
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        this.connect();
    }
    stop() {
        this.started = false;
        this.authenticated = false;
        this.sessionId = undefined;
        this.resetLanState();
        this.pendingActions.clear();
        this.clearReconnectTimer();
        this.clearHandshakeTimer();
        this.socketGeneration += 1;
        const socket = this.socket;
        this.socket = undefined;
        if (socket) {
            try {
                socket.close();
            }
            catch {
                // A closing transport is already stopped.
            }
        }
        this.setStatus("disconnected");
    }
    upsertInstance(input) {
        if (!isNonEmptyString(input.instanceId))
            return;
        const settings = copySettings(input.settings);
        const configuredActionId = isNonEmptyString(input.actionId)
            ? input.actionId
            : isNonEmptyString(settings.actionId)
                ? settings.actionId
                : undefined;
        if (configuredActionId)
            settings.actionId = configuredActionId;
        const previous = this.instances.get(input.instanceId);
        const suppliedMetadata = input.metadata === undefined ? previous?.metadata : sanitizeDeviceMetadata(input.metadata);
        const snapshot = {
            actionId: configuredActionId,
            settings,
            ...(suppliedMetadata === undefined ? {} : { metadata: copyDeviceMetadata(suppliedMetadata) }),
        };
        this.instances.set(input.instanceId, snapshot);
        if (this.authenticated
            && previous?.actionId
            && previous.actionId !== configuredActionId) {
            this.send({
                protocolVersion: PROTOCOL_VERSION,
                type: "instanceDisappeared",
                instanceId: input.instanceId,
                actionId: previous.actionId,
            });
        }
        if (this.authenticated && configuredActionId && this.isKnownAction(configuredActionId)) {
            this.sendInstanceAppeared(input.instanceId, snapshot);
        }
    }
    removeInstance(instanceId, actionId) {
        if (!isNonEmptyString(instanceId))
            return;
        const snapshot = this.instances.get(instanceId);
        if (snapshot && isNonEmptyString(actionId) && snapshot.actionId !== actionId)
            return;
        this.instances.delete(instanceId);
        if (!this.authenticated)
            return;
        const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot?.actionId;
        if (effectiveActionId) {
            this.send({
                protocolVersion: PROTOCOL_VERSION,
                type: "instanceDisappeared",
                instanceId,
                actionId: effectiveActionId,
            });
        }
    }
    keyDown(instanceId, actionId, settings) {
        if (!isNonEmptyString(instanceId))
            return;
        const snapshot = this.instances.get(instanceId);
        if (snapshot && settings) {
            snapshot.settings = copySettings(settings);
            if (snapshot.actionId)
                snapshot.settings.actionId = snapshot.actionId;
        }
        if (!this.authenticated || !snapshot)
            return;
        const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
        if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId))
            return;
        this.send({
            protocolVersion: PROTOCOL_VERSION,
            type: "keyDown",
            instanceId,
            actionId: effectiveActionId,
        });
    }
    keyUp(instanceId, actionId, settings) {
        if (!isNonEmptyString(instanceId))
            return;
        const snapshot = this.instances.get(instanceId);
        if (snapshot && settings) {
            snapshot.settings = copySettings(settings);
            if (snapshot.actionId)
                snapshot.settings.actionId = snapshot.actionId;
        }
        if (!this.authenticated || !snapshot)
            return;
        const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
        if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId))
            return;
        this.send({
            protocolVersion: PROTOCOL_VERSION,
            type: "keyUp",
            instanceId,
            actionId: effectiveActionId,
        });
    }
    dialDown(instanceId, actionId, settings) {
        this.sendDialEvent(instanceId, "dialDown", actionId, settings);
    }
    dialRotate(instanceId, actionId, ticks, pressed, settings) {
        if (!Number.isInteger(ticks) || typeof pressed !== "boolean")
            return;
        this.sendDialEvent(instanceId, "dialRotate", actionId, settings, { ticks, pressed });
    }
    dialUp(instanceId, actionId, settings) {
        this.sendDialEvent(instanceId, "dialUp", actionId, settings);
    }
    sendDialEvent(instanceId, type, actionId, settings, payload = undefined) {
        if (!isNonEmptyString(instanceId))
            return;
        const snapshot = this.instances.get(instanceId);
        if (snapshot && settings) {
            snapshot.settings = copySettings(settings);
            if (snapshot.actionId)
                snapshot.settings.actionId = snapshot.actionId;
        }
        if (!this.authenticated || !snapshot)
            return;
        const effectiveActionId = isNonEmptyString(actionId) ? actionId : snapshot.actionId;
        if (!effectiveActionId || effectiveActionId !== snapshot.actionId || !this.isKnownAction(effectiveActionId))
            return;
        this.send({
            protocolVersion: PROTOCOL_VERSION,
            type,
            instanceId,
            actionId: effectiveActionId,
            ...(payload === undefined ? {} : payload),
        });
    }
    touchTap(instanceId, actionId, hold, tapPos, settings) {
        if (typeof hold !== "boolean" || !Array.isArray(tapPos) || tapPos.length !== 2
            || tapPos.some((coordinate, index) => typeof coordinate !== "number" || !Number.isFinite(coordinate)
                || coordinate < 0 || coordinate > (index === 0 ? TOUCH_TAP_CANVAS_WIDTH : TOUCH_TAP_CANVAS_HEIGHT))) {
            return;
        }
        this.sendDialEvent(instanceId, "touchTap", actionId, settings, { hold, tapPos: [tapPos[0], tapPos[1]] });
    }
    requestActions() {
        if (!this.authenticated || this.pendingActions.size > 0)
            return;
        const requestId = this.newRequestId();
        this.pendingActions.add(requestId);
        this.send({ protocolVersion: PROTOCOL_VERSION, type: "listActions", requestId });
    }
    connect() {
        if (!this.started)
            return;
        this.clearReconnectTimer();
        this.preserveFailureCause = false;
        this.retryInMs = undefined;
        this.authenticated = false;
        this.sessionId = undefined;
        this.resetLanState();
        this.inboundUnauthRate = { tokens: UNAUTH_RATE_BURST, atMs: undefined };
        this.inboundAuthRate = { tokens: AUTH_RATE_BURST, atMs: undefined };
        this.setStatus("connecting");
        const generation = ++this.socketGeneration;
        void this.openSocket(generation);
    }
    currentTimeMs() {
        try {
            const timestamp = this.now();
            const milliseconds = timestamp.getTime();
            if (Number.isFinite(milliseconds))
                return milliseconds;
        }
        catch {
            // Fall back to a monotonic-enough wall clock for admission only.
        }
        return Date.now();
    }
    admitInbound(authenticated) {
        const bucket = authenticated ? this.inboundAuthRate : this.inboundUnauthRate;
        const capacity = authenticated ? AUTH_RATE_BURST : UNAUTH_RATE_BURST;
        const refillPerMs = authenticated ? AUTH_RATE_REFILL_PER_MS : UNAUTH_RATE_REFILL_PER_MS;
        const now = this.currentTimeMs();
        if (bucket.atMs === undefined) {
            bucket.atMs = now;
        }
        else {
            const elapsed = Math.max(0, now - bucket.atMs);
            bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
            bucket.atMs = now;
        }
        if (bucket.tokens < 1)
            return false;
        bucket.tokens -= 1;
        return true;
    }
    async openSocket(generation) {
        let token;
        if (!this.lan) {
            try {
                const value = await this.readToken(this.tokenPath);
                token = (Buffer.isBuffer(value) ? value.toString("utf8") : value).trim();
                if (!token)
                    throw new Error("Token unavailable.");
            }
            catch {
                if (this.isCurrent(generation)) {
                    this.emitDiagnostic("auth", "TOKEN_UNAVAILABLE", undefined, true);
                    this.connectionFailed(generation);
                }
                return;
            }
        }
        else {
            try {
                this.lanKey = readLanKey(await this.readKey(this.lan.keyPath));
                this.lanClientNonce = this.randomBytes(LAN_NONCE_BYTES);
                if (this.lanClientNonce.length !== LAN_NONCE_BYTES)
                    throw new Error("Invalid LAN nonce.");
                this.lanPhase = "hello";
            }
            catch {
                if (this.isCurrent(generation)) {
                    this.emitDiagnostic("auth", "LAN_KEY_UNAVAILABLE", undefined, true);
                    this.connectionFailed(generation);
                }
                return;
            }
        }
        if (!this.isCurrent(generation))
            return;
        let socket;
        try {
            socket = this.createSocket(this.url);
        }
        catch {
            this.emitDiagnostic("reconnect", "SOCKET_FAILED");
            this.connectionFailed(generation);
            return;
        }
        if (!this.isCurrent(generation)) {
            try {
                socket.close();
            }
            catch {
                // Ignore stale transport cleanup errors.
            }
            return;
        }
        this.socket = socket;
        const onOpen = () => {
            if (!this.isCurrent(generation))
                return;
            this.setStatus("authenticating");
            if (this.lan) {
                const clientNonce = this.lanClientNonce;
                if (!clientNonce) {
                    this.closeCurrentSocket(generation);
                    return;
                }
                this.sendLanHandshake({
                    protocolVersion: PROTOCOL_VERSION,
                    type: LAN_HELLO_TYPE,
                    clientId: this.lan.clientId,
                    clientNonce: encodeHex(clientNonce),
                });
            }
            else {
                this.send({
                    protocolVersion: PROTOCOL_VERSION,
                    type: "hello",
                    token: token,
                    pluginVersion: this.pluginVersion,
                });
            }
        };
        const onMessage = (data) => this.handleMessage(generation, data);
        const onClose = () => {
            if (!this.isCurrent(generation))
                return;
            this.clearHandshakeTimer();
            this.connectionFailed(generation);
        };
        const onError = () => {
            if (!this.isCurrent(generation))
                return;
            this.clearHandshakeTimer();
            this.connectionFailed(generation);
        };
        socket.on("open", onOpen);
        socket.on("message", onMessage);
        socket.on("close", onClose);
        socket.on("error", onError);
        this.handshakeTimer = this.scheduleTimeout(() => {
            if (!this.isCurrent(generation))
                return;
            this.clearHandshakeTimer();
            this.emitDiagnostic("reconnect", "SOCKET_FAILED");
            const currentSocket = this.socket;
            this.socket = undefined;
            try {
                currentSocket?.close();
            }
            catch {
                // A timed-out transport is already being replaced.
            }
            this.connectionFailed(generation);
        }, SOCKET_HANDSHAKE_TIMEOUT_MS);
    }
    sendLanHandshake(message) {
        if (!this.socket)
            return false;
        try {
            const encoded = JSON.stringify(message);
            if (jsonByteLength(encoded) > MAX_LAN_CONTROL_BYTES)
                return false;
            this.socket.send(encoded);
            return true;
        }
        catch {
            this.emitDiagnostic("reconnect", "SOCKET_FAILED");
            this.connectionFailed(this.socketGeneration);
            return false;
        }
    }
    failLanAuthentication(generation) {
        if (!this.isCurrent(generation))
            return;
        this.emitDiagnostic("auth", "AUTH_FAILED", undefined, true);
        this.closeCurrentSocket(generation);
    }
    handleLanMessage(generation, frame) {
        if (!this.admitInbound(this.authenticated)) {
            this.failLanAuthentication(generation);
            return;
        }
        let value;
        try {
            preflightJson(frame, MAX_FRAME_BYTES);
            value = JSON.parse(frame);
        }
        catch {
            this.failLanAuthentication(generation);
            return;
        }
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            this.failLanAuthentication(generation);
            return;
        }
        const message = value;
        if (message.type !== LAN_FRAME_TYPE && jsonByteLength(frame) > MAX_LAN_CONTROL_BYTES) {
            this.failLanAuthentication(generation);
            return;
        }
        if (message.protocolVersion !== PROTOCOL_VERSION) {
            this.emitDiagnostic("auth", "VERSION_MISMATCH", undefined, true);
            this.closeCurrentSocket(generation);
            return;
        }
        if (!this.authenticated && this.lanPhase === "hello" && message.type === LAN_CHALLENGE_TYPE) {
            const clientNonce = this.lanClientNonce;
            const key = this.lanKey;
            const serverNonce = typeof message.serverNonce === "string"
                ? decodeHex(message.serverNonce, LAN_NONCE_BYTES)
                : undefined;
            const proof = typeof message.serverProof === "string"
                ? decodeHex(message.serverProof, 32)
                : undefined;
            if (!clientNonce || !key || !serverNonce || !proof || message.clientId !== this.lan?.clientId) {
                this.failLanAuthentication(generation);
                return;
            }
            const expected = lanProof(key, "server", this.lan.clientId, clientNonce, serverNonce);
            if (!doubleHmacEqual(expected, proof)) {
                this.failLanAuthentication(generation);
                return;
            }
            this.lanServerNonce = serverNonce;
            this.lanSendKey = deriveLanFrameKey(key, this.lan.clientId, clientNonce, serverNonce, "client-to-server");
            this.lanReceiveKey = deriveLanFrameKey(key, this.lan.clientId, clientNonce, serverNonce, "server-to-client");
            this.lanPhase = "challenge";
            this.sendLanHandshake({
                protocolVersion: PROTOCOL_VERSION,
                type: LAN_PROOF_TYPE,
                clientId: this.lan.clientId,
                clientProof: encodeHex(lanProof(key, "client", this.lan.clientId, clientNonce, serverNonce)),
            });
            return;
        }
        if (!this.authenticated && this.lanPhase === "challenge" && message.type === LAN_READY_TYPE) {
            if (typeof message.sessionId !== "string" || message.sessionId.length === 0) {
                this.failLanAuthentication(generation);
                return;
            }
            this.sessionId = message.sessionId;
            this.authenticated = true;
            this.lanPhase = "ready";
            this.lanSendSequence = 0;
            this.lanReceiveSequence = 0;
            this.reconnectAttempt = 0;
            this.setStatus("connected");
            this.clearHandshakeTimer();
            this.requestActions();
            return;
        }
        if (this.authenticated && this.lanPhase === "ready" && message.type === LAN_FRAME_TYPE) {
            const sequence = message.sequence;
            const payload = message.payload;
            if (typeof payload !== "string" || jsonByteLength(payload) > MAX_LAN_PAYLOAD_BYTES) {
                this.failLanAuthentication(generation);
                return;
            }
            try {
                preflightJson(payload, MAX_LAN_PAYLOAD_BYTES);
            }
            catch {
                this.failLanAuthentication(generation);
                return;
            }
            const mac = typeof message.mac === "string" ? decodeHex(message.mac, 32) : undefined;
            if (!Number.isSafeInteger(sequence) || sequence !== this.lanReceiveSequence + 1
                || typeof payload !== "string" || !mac || !this.lanReceiveKey) {
                this.failLanAuthentication(generation);
                return;
            }
            const expected = lanFrameMac(this.lanReceiveKey, "server-to-client", sequence, payload);
            if (!doubleHmacEqual(expected, mac)) {
                this.failLanAuthentication(generation);
                return;
            }
            this.lanReceiveSequence = sequence;
            let parsed;
            try {
                parsed = parseServerMessage(payload);
            }
            catch {
                this.failLanAuthentication(generation);
                return;
            }
            switch (parsed.type) {
                case "actions":
                    this.handleActions(parsed);
                    break;
                case "appearance":
                    this.handleAppearance(parsed);
                    break;
                case "feedback":
                    this.handleFeedback(parsed);
                    break;
                case "error":
                    this.handleRemoteError(parsed);
                    break;
            }
            return;
        }
        if (message.type === "error") {
            try {
                const error = parseServerMessage(frame);
                this.handleRemoteError(error);
                if (["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(safeProtocolCode(error.code))) {
                    this.failLanAuthentication(generation);
                }
            }
            catch {
                this.failLanAuthentication(generation);
            }
            return;
        }
        this.failLanAuthentication(generation);
    }
    handleMessage(generation, data) {
        if (!this.isCurrent(generation))
            return;
        const frame = frameToString(data);
        if (frame.length === 0)
            return;
        if (this.lan) {
            this.handleLanMessage(generation, frame);
            return;
        }
        if (!this.admitInbound(this.authenticated)) {
            const error = { code: "MALFORMED_MESSAGE", message: SAFE_PROTOCOL_MESSAGES.MALFORMED_MESSAGE };
            this.emitProtocolError(error);
            this.emitDiagnostic("schema", "MALFORMED_MESSAGE", undefined, true);
            this.closeCurrentSocket(generation);
            return;
        }
        let message;
        try {
            message = parseServerMessage(frame);
        }
        catch (error) {
            const safe = safeError(error);
            this.emitProtocolError(safe);
            this.emitDiagnostic("schema", safeProtocolCode(safe.code), undefined, true);
            if (!this.authenticated)
                this.closeCurrentSocket(generation);
            return;
        }
        if (message.type === "helloAck") {
            if (this.authenticated || this._status !== "authenticating") {
                const error = { code: "INVALID_STATE", message: SAFE_PROTOCOL_MESSAGES.INVALID_STATE };
                this.emitProtocolError(error);
                this.emitDiagnostic("auth", "INVALID_STATE", undefined, true);
                return;
            }
            this.sessionId = message.sessionId;
            this.authenticated = true;
            this.reconnectAttempt = 0;
            this.setStatus("connected");
            this.clearHandshakeTimer();
            this.requestActions();
            return;
        }
        if (!this.authenticated) {
            if (message.type === "error") {
                this.handleRemoteError(message);
            }
            else {
                const error = { code: "AUTH_REQUIRED", message: SAFE_PROTOCOL_MESSAGES.AUTH_REQUIRED };
                this.emitProtocolError(error);
                this.emitDiagnostic("auth", "AUTH_REQUIRED", undefined, true);
                this.closeCurrentSocket(generation);
            }
            return;
        }
        switch (message.type) {
            case "actions":
                this.handleActions(message);
                break;
            case "appearance":
                this.handleAppearance(message);
                break;
            case "feedback":
                this.handleFeedback(message);
                break;
            case "error":
                this.handleRemoteError(message);
                break;
        }
    }
    handleActions(message) {
        if (!this.pendingActions.delete(message.requestId)) {
            const error = { code: "INVALID_STATE", message: SAFE_PROTOCOL_MESSAGES.INVALID_STATE };
            this.emitProtocolError(error);
            this.emitDiagnostic("registry", "INVALID_STATE");
            return;
        }
        this._actions = message.actions.map(copyAction);
        this.emit("actions", this._actions.map(copyAction));
        this.replayInstances();
    }
    handleAppearance(message) {
        const instance = this.instances.get(message.instanceId);
        if (!instance || instance.actionId !== message.actionId || !this.isKnownAction(message.actionId))
            return;
        const appearance = {
            type: "appearance",
            protocolVersion: PROTOCOL_VERSION,
            instanceId: message.instanceId,
            actionId: message.actionId,
            title: message.title,
            state: message.state,
            ...(message.appearanceVersion === undefined ? {} : { appearanceVersion: message.appearanceVersion }),
            ...(message.presentationState === undefined ? {} : { presentationState: message.presentationState }),
            ...(message.foregroundColor === undefined ? {} : { foregroundColor: message.foregroundColor }),
            ...(message.backgroundColor === undefined ? {} : { backgroundColor: message.backgroundColor }),
            ...(message.progress === undefined ? {} : { progress: message.progress }),
            ...(message.icon === undefined ? {} : { icon: message.icon }),
            ...(message.badge === undefined ? {} : { badge: message.badge }),
            ...(message.value === undefined ? {} : { value: message.value }),
            ...(message.indicator === undefined ? {} : { indicator: message.indicator }),
        };
        this.emit("appearance", appearance);
    }
    handleFeedback(message) {
        const instance = this.instances.get(message.instanceId);
        if (!instance || instance.actionId !== message.actionId || !this.isKnownAction(message.actionId))
            return;
        const feedback = {
            type: "feedback",
            protocolVersion: PROTOCOL_VERSION,
            instanceId: message.instanceId,
            actionId: message.actionId,
            kind: message.kind,
            message: message.message,
            durationMs: message.durationMs,
        };
        for (const listener of this.listeners("feedback")) {
            try {
                listener(feedback);
            }
            catch {
                // A feedback listener must not break transport processing or other listeners.
            }
        }
    }
    handleRemoteError(message) {
        const code = safeProtocolCode(message.code);
        const error = {
            code,
            message: SAFE_PROTOCOL_MESSAGES[code],
            ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
            ...(message.instanceId === undefined ? {} : { instanceId: message.instanceId }),
        };
        if (message.requestId)
            this.pendingActions.delete(message.requestId);
        this.emitProtocolError(error);
        const preserveCause = ["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(code);
        this.emitDiagnostic(diagnosticCategory(code, message.instanceId !== undefined), code, undefined, preserveCause);
        if (!this.authenticated && ["AUTH_REQUIRED", "AUTH_FAILED", "VERSION_MISMATCH"].includes(code)) {
            this.closeCurrentSocket(this.socketGeneration);
        }
    }
    replayInstances() {
        if (!this.authenticated)
            return;
        for (const [instanceId, snapshot] of this.instances) {
            if (!this.isCurrentInstance(instanceId, snapshot) || !snapshot.actionId || !this.isKnownAction(snapshot.actionId))
                continue;
            this.sendInstanceAppeared(instanceId, snapshot);
            if (this.isCurrentInstance(instanceId, snapshot)) {
                this.send({
                    protocolVersion: PROTOCOL_VERSION,
                    type: "requestAppearance",
                    instanceId,
                    actionId: snapshot.actionId,
                });
            }
        }
    }
    sendInstanceAppeared(instanceId, snapshot) {
        if (!snapshot.actionId)
            return;
        this.send({
            protocolVersion: PROTOCOL_VERSION,
            type: "instanceAppeared",
            instanceId,
            actionId: snapshot.actionId,
            settings: copySettings(snapshot.settings),
            ...(snapshot.metadata === undefined ? {} : { metadata: copyDeviceMetadata(snapshot.metadata) }),
        });
    }
    send(message) {
        if (!this.socket)
            return false;
        const sessionId = this.sessionId;
        if (this.lan) {
            if (!isNonEmptyString(sessionId))
                return false;
            let payload;
            try {
                payload = serializeClientMessage({ ...message, sessionId });
            }
            catch {
                return false;
            }
            return this.sendLanPayload(payload);
        }
        let outbound;
        if (message.type === "hello") {
            outbound = message;
        }
        else {
            if (!isNonEmptyString(sessionId))
                return false;
            outbound = { ...message, sessionId };
        }
        try {
            this.socket.send(serializeClientMessage(outbound));
            return true;
        }
        catch {
            this.emitDiagnostic("reconnect", "SOCKET_FAILED");
            this.connectionFailed(this.socketGeneration);
            return false;
        }
    }
    sendLanPayload(payload) {
        const key = this.lanSendKey;
        if (!this.socket || !key || jsonByteLength(payload) > MAX_LAN_PAYLOAD_BYTES)
            return false;
        const sequence = this.lanSendSequence + 1;
        try {
            const encoded = JSON.stringify({
                protocolVersion: PROTOCOL_VERSION,
                type: LAN_FRAME_TYPE,
                sequence,
                payload,
                mac: encodeHex(lanFrameMac(key, "client-to-server", sequence, payload)),
            });
            if (jsonByteLength(encoded) > MAX_FRAME_BYTES)
                return false;
            this.socket.send(encoded);
            this.lanSendSequence = sequence;
            return true;
        }
        catch {
            this.emitDiagnostic("reconnect", "SOCKET_FAILED");
            this.connectionFailed(this.socketGeneration);
            return false;
        }
    }
    clearHandshakeTimer() {
        if (this.handshakeTimer === undefined)
            return;
        this.cancelTimeout(this.handshakeTimer);
        this.handshakeTimer = undefined;
    }
    resetLanState() {
        this.lanPhase = undefined;
        this.lanKey = undefined;
        this.lanClientNonce = undefined;
        this.lanServerNonce = undefined;
        this.lanSendKey = undefined;
        this.lanReceiveKey = undefined;
        this.lanSendSequence = 0;
        this.lanReceiveSequence = 0;
    }
    connectionFailed(generation) {
        if (!this.isCurrent(generation))
            return;
        if (this.socket === undefined && this._status === "disconnected")
            return;
        this.authenticated = false;
        this.sessionId = undefined;
        this.resetLanState();
        this.pendingActions.clear();
        this.clearHandshakeTimer();
        this.setStatus("disconnected");
        this.socket = undefined;
        if (!this.preserveFailureCause)
            this.emitDiagnostic("reconnect", "DISCONNECTED");
        for (const [instanceId, snapshot] of this.instances) {
            if (snapshot.actionId) {
                this.emit("appearance", {
                    type: "appearance",
                    protocolVersion: PROTOCOL_VERSION,
                    instanceId,
                    actionId: snapshot.actionId,
                    title: "Hammerspoon Offline",
                    state: 0,
                });
            }
        }
        this.scheduleReconnect();
    }
    scheduleReconnect() {
        if (!this.started || this.reconnectTimer !== undefined)
            return;
        const baseDelay = Math.min(MAX_RECONNECT_MS, INITIAL_RECONNECT_MS * 2 ** Math.min(this.reconnectAttempt, 6));
        this.reconnectAttempt += 1;
        const jitter = 0.5 + Math.max(0, Math.min(1, this.random()));
        const delay = Math.min(MAX_RECONNECT_MS, Math.round(baseDelay * jitter));
        if (this.preserveFailureCause) {
            this.retryInMs = delay;
        }
        else {
            this.emitDiagnostic("reconnect", "RECONNECTING", delay);
        }
        this.reconnectTimer = this.scheduleTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, delay);
    }
    closeCurrentSocket(generation) {
        if (!this.isCurrent(generation))
            return;
        const socket = this.socket;
        this.socket = undefined;
        this.authenticated = false;
        this.sessionId = undefined;
        if (socket) {
            try {
                socket.close();
            }
            catch {
                // The close event will be handled if the transport supports it.
            }
        }
        this.connectionFailed(generation);
    }
    isKnownAction(actionId) {
        return this._actions.some((action) => action.actionId === actionId);
    }
    isCurrentInstance(instanceId, snapshot) {
        return this.instances.get(instanceId) === snapshot;
    }
    newRequestId() {
        this.nextRequestId += 1;
        return `bridge-${this.nextRequestId}`;
    }
    clearReconnectTimer() {
        if (this.reconnectTimer === undefined)
            return;
        this.cancelTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
    }
    isCurrent(generation) {
        return this.started && generation === this.socketGeneration;
    }
    setStatus(status) {
        if (this._status === status)
            return;
        this._status = status;
        this.emit("status", status);
    }
    emitDiagnostic(area, code, retryInMs, preserveCause = false) {
        if (preserveCause) {
            this.preserveFailureCause = true;
        }
        else if (area !== "reconnect") {
            this.preserveFailureCause = false;
        }
        this.retryInMs = retryInMs === undefined
            ? undefined
            : Math.max(0, Math.min(MAX_RECONNECT_MS, Math.floor(retryInMs)));
        let at = new Date(0).toISOString();
        try {
            const timestamp = this.now();
            if (timestamp instanceof Date && Number.isFinite(timestamp.getTime()))
                at = timestamp.toISOString();
        }
        catch {
            // Keep a fixed safe UTC timestamp when the injected clock fails.
        }
        this.latestDiagnostic = { area, code, at };
        const status = this.diagnostics;
        const encoded = JSON.stringify(status);
        const safeFallback = JSON.stringify({
            version: 1,
            status: status.status,
            protocolVersion: status.protocolVersion,
            pluginVersion: status.pluginVersion,
            port: status.port,
        });
        const line = `bridge-status ${encoded.length + 14 <= MAX_DIAGNOSTIC_LINE ? encoded : safeFallback}`;
        const key = `${area}:${code}`;
        if (!this.loggedDiagnosticKeys.has(key)) {
            this.loggedDiagnosticKeys.add(key);
            try {
                this.logger(line);
            }
            catch {
                // Diagnostics logging must not affect transport processing.
            }
        }
        this.emit("diagnostics", this.diagnostics);
    }
    emitProtocolError(error) {
        this.emit("protocolError", error);
    }
}

const DEVICE_TYPE_NAMES = {
    0: "stream-deck",
    1: "stream-deck-mini",
    2: "stream-deck-xl",
    3: "stream-deck-mobile",
    4: "corsair-g-keys",
    5: "stream-deck-pedal",
    6: "corsair-voyager",
    7: "stream-deck-plus",
    8: "scuf-controller",
    9: "stream-deck-neo",
    10: "stream-deck-studio",
    11: "virtual-stream-deck",
    12: "galleon-100-sd",
    13: "stream-deck-plus-xl",
};
const DEFAULT_RENDERING_PROFILE = {
    imageSize: 72,
    encoderLayout: "$A1",
};
const RENDERING_PROFILES = {
    "keypad:stream-deck:5x3": { imageSize: 72 },
    "keypad:stream-deck-mini:3x2": { imageSize: 80 },
    "keypad:stream-deck-xl:8x4": { imageSize: 96 },
    "keypad:stream-deck-plus:4x2": { imageSize: 120 },
    "keypad:stream-deck-neo:4x2": { imageSize: 96 },
    "encoder:stream-deck-plus:4x2": {
        imageSize: 48,
        encoderLayout: "$A1",
        encoderDecoratedLayout: "$A0",
        encoderValueLayout: "$B1",
    },
    "encoder:stream-deck-studio:16x2": {
        imageSize: 48,
        encoderLayout: "$A1",
        encoderDecoratedLayout: "$A0",
        encoderValueLayout: "$B1",
    },
    "encoder:galleon-100-sd:3x4": {
        imageSize: 48,
        encoderLayout: "$A1",
        encoderDecoratedLayout: "$A0",
        encoderValueLayout: "$B1",
    },
    "encoder:stream-deck-plus-xl:9x4": {
        imageSize: 48,
        encoderLayout: "$A1",
        encoderDecoratedLayout: "$A0",
        encoderValueLayout: "$B1",
    },
};
function recognizedRenderingProfile(metadata) {
    const { controllerType, device } = metadata;
    return RENDERING_PROFILES[`${controllerType}:${device.type}:${device.size.columns}x${device.size.rows}`];
}
function selectRenderingProfile(metadata) {
    if (metadata === undefined) {
        return DEFAULT_RENDERING_PROFILE;
    }
    const sanitized = sanitizeDeviceMetadata(metadata);
    if (sanitized === undefined) {
        return undefined;
    }
    return recognizedRenderingProfile(sanitized) ?? DEFAULT_RENDERING_PROFILE;
}
function extractDeviceMetadata(action) {
    try {
        const context = action;
        const device = context.device;
        if (!device)
            return undefined;
        const deviceType = typeof device.type === "number"
            ? (DEVICE_TYPE_NAMES[device.type] ?? "unknown")
            : "unknown";
        const controllerType = context.controllerType === "Keypad"
            ? "keypad"
            : context.controllerType === "Encoder"
                ? "encoder"
                : undefined;
        const metadata = sanitizeDeviceMetadata({
            controllerType,
            device: {
                type: deviceType,
                size: { columns: device.size?.columns, rows: device.size?.rows },
            },
        });
        if (metadata === undefined)
            return undefined;
        const renderingProfile = recognizedRenderingProfile(metadata);
        return renderingProfile === undefined
            ? metadata
            : { ...metadata, imageSize: renderingProfile.imageSize };
    }
    catch {
        return undefined;
    }
}
function cloneJsonValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneJsonValue);
    }
    if (value !== null && typeof value === "object") {
        const copy = {};
        for (const [key, nested] of Object.entries(value)) {
            copy[key] = cloneJsonValue(nested);
        }
        return copy;
    }
    return value;
}
const HAMMERSPOON_ACTION_UUID = "com.brettinternet.hammerspoon.action";
const HAMMERSPOON_BUTTON_UUID = "com.brettinternet.hammerspoon.button";
const HAMMERSPOON_MULTI_STATE_UUID = "com.brettinternet.hammerspoon.multistate";
function escapeXml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
    })[character] ?? character);
}
const BUNDLED_BUTTON_ICON_PATH = "imgs/button.svg";
const BUNDLED_TOGGLE_INACTIVE_ICON_PATH = "imgs/toggle-off.svg";
const BUNDLED_TOGGLE_ACTIVE_ICON_PATH = "imgs/toggle-on.svg";
function hasValidAppearanceExtension(appearance) {
    const hasValue = appearance.value !== undefined;
    const hasIndicator = appearance.indicator !== undefined;
    if (hasValue !== hasIndicator) {
        return false;
    }
    if (appearance.presentationState !== undefined &&
        (appearance.appearanceVersion !== 1 ||
            !Number.isInteger(appearance.presentationState) ||
            appearance.presentationState < 0 ||
            appearance.presentationState > 3)) {
        return false;
    }
    if (!hasValue) {
        return true;
    }
    return (appearance.appearanceVersion === 1 &&
        isSafeAppearanceValue(appearance.value) &&
        typeof appearance.indicator === "number" &&
        Number.isFinite(appearance.indicator) &&
        appearance.indicator >= 0 &&
        appearance.indicator <= 100 &&
        appearance.foregroundColor === undefined &&
        appearance.backgroundColor === undefined &&
        appearance.progress === undefined &&
        appearance.badge === undefined &&
        (appearance.icon === undefined || isSafeAppearanceIcon(appearance.icon)));
}
function appearanceImage(appearance, imageSize, bundledIcon = BUNDLED_BUTTON_ICON_PATH) {
    const icon = appearance.icon;
    const hasDecoration = appearance.foregroundColor !== undefined ||
        appearance.backgroundColor !== undefined ||
        appearance.progress !== undefined ||
        appearance.badge !== undefined;
    let customIconImage;
    if (icon !== undefined) {
        if (!isSafeAppearanceIcon(icon)) {
            return undefined;
        }
        if (icon.kind === "custom") {
            customIconImage = safeAppearanceIconImage(icon);
            if (customIconImage === undefined) {
                return undefined;
            }
            if (!hasDecoration) {
                return customIconImage;
            }
        }
        else if (!hasDecoration) {
            return bundledIcon;
        }
    }
    if (appearance.appearanceVersion !== 1 || !hasDecoration) {
        return undefined;
    }
    if ((appearance.foregroundColor !== undefined &&
        (typeof appearance.foregroundColor !== "string" ||
            !/^#[0-9A-Fa-f]{6}$/.test(appearance.foregroundColor))) ||
        (appearance.backgroundColor !== undefined &&
            (typeof appearance.backgroundColor !== "string" ||
                !/^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor))) ||
        (appearance.progress !== undefined &&
            (typeof appearance.progress !== "number" ||
                !Number.isFinite(appearance.progress) ||
                appearance.progress < 0 ||
                appearance.progress > 1))) {
        return undefined;
    }
    const foreground = appearance.foregroundColor ?? "#FFFFFF";
    const background = appearance.backgroundColor ?? "#000000";
    const progress = appearance.progress;
    const badge = appearance.badge;
    if (badge !== undefined && typeof badge !== "string") {
        return undefined;
    }
    if (typeof badge === "string") {
        if ([...badge].length > 4) {
            return undefined;
        }
        for (const character of badge) {
            const codePoint = character.codePointAt(0);
            if (codePoint !== undefined &&
                (codePoint <= 0x08 ||
                    (codePoint >= 0x0b && codePoint <= 0x0c) ||
                    (codePoint >= 0x0e && codePoint <= 0x1f))) {
                return undefined;
            }
        }
    }
    const iconMarkup = icon?.kind === "bundled"
        ? `<image href="${bundledIcon}" x="0" y="0" width="${imageSize}" height="${imageSize}"/>`
        : customIconImage === undefined
            ? ""
            : `<image href="${escapeXml(customIconImage)}" x="0" y="0" width="${imageSize}" height="${imageSize}"/>`;
    const scale = imageSize / 72;
    const progressInset = 4 * scale;
    const progressWidth = 64 * scale;
    const progressHeight = 4 * scale;
    const progressY = 64 * scale;
    const borderInset = 2 * scale;
    const borderSize = 68 * scale;
    const borderWidth = 4 * scale;
    const badgeX = 68 * scale;
    const badgeY = 14 * scale;
    const progressBar = progress === undefined
        ? ""
        : `<rect x="${progressInset}" y="${progressY}" width="${Math.round(progress * progressWidth)}" height="${progressHeight}" fill="${foreground}"/>`;
    const foregroundBorder = appearance.foregroundColor === undefined
        ? ""
        : `<rect x="${borderInset}" y="${borderInset}" width="${borderSize}" height="${borderSize}" fill="none" stroke="${foreground}" stroke-width="${borderWidth}"/>`;
    const badgeText = badge === undefined
        ? ""
        : `<text x="${badgeX}" y="${badgeY}" text-anchor="end" fill="${foreground}">${escapeXml(badge)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageSize}" height="${imageSize}" viewBox="0 0 ${imageSize} ${imageSize}"><rect width="${imageSize}" height="${imageSize}" fill="${background}"/>${iconMarkup}${foregroundBorder}${progressBar}${badgeText}</svg>`;
    try {
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    catch {
        return undefined;
    }
}
function dialAppearanceImage(appearance, imageSize, bundledIcon = BUNDLED_BUTTON_ICON_PATH) {
    if (appearanceImage(appearance, imageSize, bundledIcon) === undefined) {
        return undefined;
    }
    const icon = appearance.icon;
    const customIconImage = icon?.kind === "custom" ? safeAppearanceIconImage(icon) : undefined;
    const iconMarkup = icon?.kind === "bundled"
        ? `<image href="${bundledIcon}" x="16" y="40" width="${imageSize}" height="${imageSize}"/>`
        : customIconImage === undefined
            ? ""
            : `<image href="${escapeXml(customIconImage)}" x="16" y="40" width="${imageSize}" height="${imageSize}"/>`;
    const foreground = appearance.foregroundColor ?? "#FFFFFF";
    const background = appearance.backgroundColor ?? "#000000";
    const progressBar = appearance.progress === undefined
        ? ""
        : `<rect x="16" y="88" width="${Math.round(168 * appearance.progress)}" height="4" fill="${foreground}"/>`;
    const foregroundBorder = appearance.foregroundColor === undefined
        ? ""
        : `<rect x="2" y="2" width="196" height="96" fill="none" stroke="${foreground}" stroke-width="4"/>`;
    const badge = appearance.badge === undefined
        ? ""
        : `<text x="184" y="16" text-anchor="end" fill="${foreground}">${escapeXml(appearance.badge)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="${background}"/>${iconMarkup}${foregroundBorder}${progressBar}${badge}</svg>`;
    try {
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    catch {
        return undefined;
    }
}
function disconnectedTitle(status) {
    if (status === "connecting" || status === "authenticating") {
        return "Connecting";
    }
    if (status === "connected") {
        return "Syncing";
    }
    return "Offline";
}
const DIAGNOSTIC_AREAS = [
    "auth",
    "schema",
    "reconnect",
    "registry",
    "callback",
];
const DIAGNOSTIC_CODES = [
    "AUTH_REQUIRED",
    "AUTH_FAILED",
    "VERSION_MISMATCH",
    "MALFORMED_MESSAGE",
    "UNKNOWN_TYPE",
    "INVALID_FIELD",
    "INVALID_STATE",
    "UNKNOWN_ACTION",
    "STALE_INSTANCE",
    "CALLBACK_FAILED",
    "INTERNAL",
    "TOKEN_UNAVAILABLE",
    "SOCKET_FAILED",
    "DISCONNECTED",
    "RECONNECTING",
];
function safeDiagnosticsSnapshot(value) {
    const fallback = {
        version: 1,
        status: "disconnected",
        protocolVersion: 1,
        pluginVersion: "unknown",
        port: 0,
    };
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return fallback;
    }
    const candidate = value;
    const snapshot = {
        ...fallback,
        ...(typeof candidate.pluginVersion === "string" &&
            /^[A-Za-z0-9._-]{1,32}$/.test(candidate.pluginVersion)
            ? { pluginVersion: candidate.pluginVersion }
            : {}),
        ...(typeof candidate.port === "number" &&
            Number.isInteger(candidate.port) &&
            candidate.port >= 1 &&
            candidate.port <= 65535
            ? { port: candidate.port }
            : {}),
        ...(typeof candidate.retryInMs === "number" &&
            Number.isInteger(candidate.retryInMs) &&
            candidate.retryInMs >= 0 &&
            candidate.retryInMs <= 600000
            ? { retryInMs: candidate.retryInMs }
            : {}),
    };
    const latest = candidate.latest;
    if (latest !== null && typeof latest === "object" && !Array.isArray(latest)) {
        const latestCandidate = latest;
        const at = typeof latestCandidate.at === "string"
            ? new Date(latestCandidate.at)
            : undefined;
        if (typeof latestCandidate.area === "string" &&
            DIAGNOSTIC_AREAS.includes(latestCandidate.area) &&
            typeof latestCandidate.code === "string" &&
            DIAGNOSTIC_CODES.includes(latestCandidate.code) &&
            at !== undefined &&
            Number.isFinite(at.getTime())) {
            snapshot.latest = {
                area: latestCandidate.area,
                code: latestCandidate.code,
                at: at.toISOString(),
            };
        }
    }
    return snapshot;
}
function isDialAction(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.isDial === "function" &&
        candidate.isDial());
}
function isRequestStateMessage(value) {
    return (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.type === "requestState");
}
function isRefreshActionsMessage(value) {
    return (typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.type === "refreshActions");
}
/** Bridges the official generic keypad action to one shared Hammerspoon connection. */
class HammerspoonAction extends SingletonAction {
    bridge;
    manifestId;
    instances = new Map();
    synchronized = new Set();
    renderQueues = new Map();
    scheduleTimeout;
    cancelTimeout;
    mode;
    subscribed = false;
    constructor(bridge, options = {}) {
        super();
        this.bridge = bridge;
        this.manifestId = options.manifestId ?? HAMMERSPOON_ACTION_UUID;
        this.mode = options.mode ?? "toggle";
        this.scheduleTimeout =
            options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
        this.cancelTimeout =
            options.clearTimeout ??
                ((handle) => clearTimeout(handle));
    }
    /** Subscribes this action adapter to bridge lifecycle and rendering events. */
    subscribe() {
        if (this.subscribed) {
            return;
        }
        this.subscribed = true;
        this.bridge.on("status", (status) => {
            if (status !== "connected") {
                this.synchronized.clear();
                for (const instance of this.instances.values()) {
                    this.cancelFeedbackTimer(instance);
                }
            }
            this.renderStatus();
            void this.sendBridgeState();
        });
        this.bridge.on("diagnostics", () => {
            this.renderStatus();
            void this.sendBridgeState();
        });
        this.bridge.on("actions", () => {
            void this.sendBridgeState(streamDeck.ui.action?.id);
        });
        streamDeck.ui.onDidAppear((event) => {
            void this.sendBridgeState(event?.action?.id ?? streamDeck.ui.action?.id);
        });
        this.bridge.on("appearance", (appearance) => {
            void this.enqueueRender(appearance.instanceId, () => this.renderAppearance(appearance));
        });
        this.bridge.on("feedback", (feedback) => {
            void this.enqueueRender(feedback.instanceId, () => this.renderFeedback(feedback));
            void this.sendInspectorFeedback(feedback);
        });
        this.bridge.on("protocolError", (error) => {
            if (error.instanceId) {
                const instance = this.instances.get(error.instanceId);
                if (instance) {
                    void this.alert(instance.action);
                }
            }
        });
    }
    async onWillAppear(ev) {
        if (!ev.action.isKey() && !isDialAction(ev.action)) {
            return;
        }
        const instanceId = ev.action.id;
        const settings = this.settingsFrom(ev.payload.settings);
        const metadata = extractDeviceMetadata(ev.action);
        const renderingProfile = selectRenderingProfile(metadata);
        const previous = this.instances.get(instanceId);
        if (previous) {
            this.cancelFeedbackTimer(previous);
        }
        this.instances.set(instanceId, {
            action: ev.action,
            actionId: settings.actionId,
            metadata,
            renderingProfile,
            settings,
            imageAppliedStates: new Set(previous?.imageAppliedStates),
        });
        this.synchronized.delete(instanceId);
        await this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
        if (settings.actionId) {
            this.bridge.upsertInstance({
                instanceId,
                actionId: settings.actionId,
                settings: settings,
                metadata,
            });
        }
        if (isDialAction(ev.action)) {
            if (await this.setDialLayout(ev.action, renderingProfile)) {
                const current = this.instances.get(instanceId);
                if (current)
                    current.encoderLayout = "$A1";
            }
        }
    }
    async onWillDisappear(ev) {
        const instanceId = ev.action.id;
        const instance = this.instances.get(instanceId);
        this.cancelFeedbackTimer(instance);
        this.instances.delete(instanceId);
        this.synchronized.delete(instanceId);
        if (instance?.actionId) {
            this.bridge.removeInstance(instanceId, instance.actionId);
        }
    }
    async onDidReceiveSettings(ev) {
        if (!ev.action.isKey() && !isDialAction(ev.action)) {
            return;
        }
        const instanceId = ev.action.id;
        const settings = this.settingsFrom(ev.payload.settings);
        const metadata = extractDeviceMetadata(ev.action);
        const renderingProfile = selectRenderingProfile(metadata);
        const previous = this.instances.get(instanceId);
        if (previous?.actionId && previous.actionId !== settings.actionId) {
            this.bridge.removeInstance(instanceId, previous.actionId);
        }
        this.instances.set(instanceId, {
            action: ev.action,
            actionId: settings.actionId,
            metadata,
            renderingProfile,
            settings,
            imageAppliedStates: new Set(previous?.imageAppliedStates),
        });
        this.synchronized.delete(instanceId);
        this.cancelFeedbackTimer(previous);
        await this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
        if (settings.actionId) {
            this.bridge.upsertInstance({
                instanceId,
                actionId: settings.actionId,
                settings: settings,
                metadata,
            });
        }
        if (isDialAction(ev.action)) {
            if (await this.setDialLayout(ev.action, renderingProfile)) {
                const current = this.instances.get(instanceId);
                if (current)
                    current.encoderLayout = "$A1";
            }
        }
    }
    async onKeyDown(ev) {
        if (!ev.action.isKey()) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.keyDown(ev.action.id, instance.actionId, instance.settings);
    }
    async onKeyUp(ev) {
        if (!ev.action.isKey()) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.keyUp(ev.action.id, instance.actionId, instance.settings);
    }
    async onDialDown(ev) {
        if (!isDialAction(ev.action)) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.dialDown(ev.action.id, instance.actionId, instance.settings);
    }
    async onDialRotate(ev) {
        if (!isDialAction(ev.action)) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.dialRotate(ev.action.id, instance.actionId, ev.payload.ticks, ev.payload.pressed, instance.settings);
    }
    async onDialUp(ev) {
        if (!isDialAction(ev.action)) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.dialUp(ev.action.id, instance.actionId, instance.settings);
    }
    async onTouchTap(ev) {
        if (!isDialAction(ev.action)) {
            return;
        }
        const instance = this.instances.get(ev.action.id);
        if (!instance?.actionId) {
            await this.enqueueRender(ev.action.id, () => this.renderInstance(ev.action.id));
            return;
        }
        this.bridge.touchTap(ev.action.id, instance.actionId, ev.payload.hold, ev.payload.tapPos, instance.settings);
    }
    async onSendToPlugin(ev) {
        if (isRefreshActionsMessage(ev.payload)) {
            this.bridge.requestActions();
            return;
        }
        if (isRequestStateMessage(ev.payload)) {
            await this.sendBridgeState(ev.action?.id ?? streamDeck.ui.action?.id);
        }
    }
    targetState(appearance) {
        if (this.mode !== "multi-state") {
            return appearance.state;
        }
        return appearance.presentationState ?? appearance.state;
    }
    settingsFrom(value) {
        const settings = cloneJsonValue(value);
        if (typeof settings.actionId !== "string" ||
            settings.actionId.length === 0) {
            delete settings.actionId;
        }
        return settings;
    }
    async renderInstance(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return;
        }
        if (!instance.actionId) {
            if (instance.action.isKey()) {
                const stateApplied = await this.setState(instance.action, 0);
                if (stateApplied && !(await this.clearImage(instance, 0))) {
                    return;
                }
            }
            await this.setActionTitle(instance.action, "Select action", instance.renderingProfile);
            return;
        }
        if (this.bridge.status !== "connected" ||
            !this.synchronized.has(instanceId)) {
            if (instance.action.isKey()) {
                const stateApplied = await this.setState(instance.action, 0);
                if (stateApplied && !(await this.clearImage(instance, 0))) {
                    return;
                }
            }
            await this.setActionTitle(instance.action, disconnectedTitle(this.bridge.status), instance.renderingProfile);
            return;
        }
        await this.setActionTitle(instance.action, "Hammerspoon", instance.renderingProfile);
        if (instance.action.isKey()) {
            await this.setState(instance.action, 0);
        }
    }
    renderStatus() {
        for (const instanceId of this.instances.keys()) {
            void this.enqueueRender(instanceId, () => this.renderInstance(instanceId));
        }
    }
    enqueueRender(instanceId, render) {
        const previous = this.renderQueues.get(instanceId) ?? Promise.resolve();
        const next = previous.then(render, render);
        this.renderQueues.set(instanceId, next);
        void next.then(() => {
            if (this.renderQueues.get(instanceId) === next) {
                this.renderQueues.delete(instanceId);
            }
        }, () => {
            if (this.renderQueues.get(instanceId) === next) {
                this.renderQueues.delete(instanceId);
            }
        });
        return next;
    }
    async renderAppearance(appearance) {
        const instance = this.instances.get(appearance.instanceId);
        if (!instance || instance.actionId !== appearance.actionId) {
            return;
        }
        if (!hasValidAppearanceExtension(appearance)) {
            return;
        }
        if (this.bridge.status !== "connected") {
            await this.renderInstance(appearance.instanceId);
            return;
        }
        const bundledIcon = this.mode === "toggle"
            ? appearance.state === 1
                ? BUNDLED_TOGGLE_ACTIVE_ICON_PATH
                : BUNDLED_TOGGLE_INACTIVE_ICON_PATH
            : BUNDLED_BUTTON_ICON_PATH;
        if (isDialAction(instance.action)) {
            if (!(await this.setDialTitle(instance.action, appearance.title, instance.renderingProfile, appearance, bundledIcon))) {
                return;
            }
            instance.lastAppearance = appearance;
            this.synchronized.add(appearance.instanceId);
            return;
        }
        const image = appearanceImage(appearance, instance.renderingProfile?.imageSize ??
            DEFAULT_RENDERING_PROFILE.imageSize, bundledIcon);
        if (appearance.icon !== undefined && image === undefined) {
            await this.alert(instance.action);
            return;
        }
        const targetState = this.mode === "button" ? 0 : this.targetState(appearance);
        const previousState = instance.lastAppearance === undefined
            ? 0
            : this.mode === "button"
                ? 0
                : this.targetState(instance.lastAppearance);
        if (this.mode !== "button" &&
            !(await this.setState(instance.action, targetState))) {
            return;
        }
        if (!(await this.applyImage(instance, image, targetState))) {
            if (this.mode !== "button") {
                await this.setState(instance.action, previousState);
            }
            return;
        }
        instance.lastAppearance = appearance;
        this.synchronized.add(appearance.instanceId);
        await this.setActionTitle(instance.action, appearance.title, instance.renderingProfile);
    }
    async renderFeedback(feedback) {
        const instance = this.instances.get(feedback.instanceId);
        if (!instance ||
            instance.actionId !== feedback.actionId ||
            this.bridge.status !== "connected") {
            return;
        }
        this.cancelFeedbackTimer(instance);
        await this.setActionTitle(instance.action, feedback.message, instance.renderingProfile);
        try {
            if (feedback.kind === "success") {
                if (instance.action.isKey()) {
                    await instance.action.showOk();
                }
            }
            else {
                await instance.action.showAlert();
            }
        }
        catch {
            // Stream Deck feedback is best-effort when an instance is disappearing.
        }
        try {
            instance.feedbackTimer = this.scheduleTimeout(() => {
                if (this.instances.get(feedback.instanceId) !== instance) {
                    return;
                }
                instance.feedbackTimer = undefined;
                void this.enqueueRender(feedback.instanceId, () => this.restoreInstance(feedback.instanceId, instance));
            }, feedback.durationMs);
        }
        catch {
            // A failed timer must not affect the bridge or callback loop.
        }
    }
    async restoreInstance(instanceId, expected) {
        if (this.instances.get(instanceId) !== expected) {
            return;
        }
        if (this.bridge.status === "connected" &&
            this.synchronized.has(instanceId) &&
            expected.lastAppearance) {
            await this.renderAppearance(expected.lastAppearance);
        }
        else {
            await this.renderInstance(instanceId);
        }
    }
    cancelFeedbackTimer(instance) {
        if (!instance || instance.feedbackTimer === undefined) {
            return;
        }
        try {
            this.cancelTimeout(instance.feedbackTimer);
        }
        catch {
            // A stale timer is harmless when an instance is disappearing.
        }
        instance.feedbackTimer = undefined;
    }
    async clearImage(instance, state) {
        if (!instance.action.isKey() || !instance.imageAppliedStates.has(state)) {
            return true;
        }
        if (await this.setImage(instance.action, undefined, this.mode === "button" ? undefined : state)) {
            instance.imageAppliedStates.delete(state);
            return true;
        }
        return false;
    }
    async applyImage(instance, image, state) {
        if (!instance.action.isKey()) {
            return true;
        }
        if (image === undefined) {
            return this.clearImage(instance, state);
        }
        if (await this.setImage(instance.action, image, this.mode === "button" ? undefined : state)) {
            instance.imageAppliedStates.add(state);
            return true;
        }
        if (await this.setImage(instance.action, undefined, this.mode === "button" ? undefined : state)) {
            instance.imageAppliedStates.delete(state);
            return true;
        }
        return false;
    }
    async setActionTitle(action, title, renderingProfile) {
        if (isDialAction(action)) {
            return this.setDialTitle(action, title, renderingProfile);
        }
        await this.setTitle(action, title);
        return true;
    }
    async setDialLayout(action, renderingProfile, layout = renderingProfile?.encoderLayout ?? "$A1") {
        const instance = this.instances.get(action.id);
        if (instance?.action === action && instance.encoderLayout === layout) {
            return true;
        }
        try {
            await action.setFeedbackLayout(layout);
            const current = this.instances.get(action.id);
            if (current?.action === action) {
                current.encoderLayout = layout;
            }
            return true;
        }
        catch {
            await this.alert(action);
            return false;
        }
    }
    async setDialTitle(action, title, renderingProfile, appearance, bundledIcon = BUNDLED_BUTTON_ICON_PATH) {
        const hasDecoration = appearance !== undefined &&
            (appearance.icon !== undefined ||
                appearance.foregroundColor !== undefined ||
                appearance.backgroundColor !== undefined ||
                appearance.progress !== undefined ||
                appearance.badge !== undefined);
        const layout = hasDecoration && renderingProfile?.encoderDecoratedLayout !== undefined
            ? renderingProfile.encoderDecoratedLayout
            : (renderingProfile?.encoderLayout ?? "$A1");
        const hasValueIndicator = appearance !== undefined &&
            appearance.value !== undefined &&
            appearance.indicator !== undefined;
        if (hasValueIndicator && renderingProfile?.encoderValueLayout === "$B1") {
            const icon = appearance.icon === undefined
                ? undefined
                : appearance.icon.kind === "bundled"
                    ? bundledIcon
                    : safeAppearanceIconImage(appearance.icon);
            if (appearance.icon !== undefined && icon === undefined) {
                await this.alert(action);
                return false;
            }
            const feedback = {
                title,
                value: appearance.value,
                indicator: appearance.indicator,
            };
            if (icon !== undefined) {
                feedback.icon = icon;
            }
            if (!(await this.setDialLayout(action, renderingProfile, "$B1"))) {
                await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
                return false;
            }
            try {
                await action.setFeedback(feedback);
                return true;
            }
            catch {
                await this.alert(action);
                await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
                return false;
            }
        }
        try {
            if (hasDecoration && layout === "$A0") {
                const image = dialAppearanceImage(appearance, renderingProfile?.imageSize ?? 48, bundledIcon);
                if (image === undefined) {
                    await this.alert(action);
                    return false;
                }
                if (!(await this.setDialLayout(action, renderingProfile, layout))) {
                    await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
                    return false;
                }
                try {
                    await action.setFeedback({ "full-canvas": image, title });
                    return true;
                }
                catch {
                    await this.alert(action);
                    await this.setDialTitle(action, title, DEFAULT_RENDERING_PROFILE);
                    return false;
                }
            }
            if (!(await this.setDialLayout(action, renderingProfile, layout))) {
                return false;
            }
            try {
                await action.setFeedback({ title });
                return true;
            }
            catch {
                await this.alert(action);
                return false;
            }
        }
        catch {
            await this.alert(action);
            return false;
        }
    }
    async setImage(action, image, state) {
        try {
            await action.setImage(image, state === undefined ? undefined : { state });
            return true;
        }
        catch {
            await this.alert(action);
            return false;
        }
    }
    async setTitle(action, title) {
        try {
            await action.setTitle(title);
        }
        catch {
            await this.alert(action);
        }
    }
    async setState(action, state) {
        try {
            await action.setState(state);
            return true;
        }
        catch {
            await this.alert(action);
            return false;
        }
    }
    async alert(action) {
        try {
            await action.showAlert();
        }
        catch {
            // Stream Deck feedback is best-effort when an instance is disappearing.
        }
    }
    async sendInspectorFeedback(feedback) {
        if (streamDeck.ui.action?.id !== feedback.instanceId) {
            return;
        }
        await streamDeck.ui.sendToPropertyInspector({
            type: "inspectorFeedback",
            kind: feedback.kind,
            message: feedback.message,
            durationMs: feedback.durationMs,
        });
    }
    async sendBridgeState(instanceId = streamDeck.ui.action?.id) {
        const actions = this.bridge.actions.map((action) => {
            const copy = {
                actionId: action.actionId,
                name: action.name,
            };
            if (action.description !== undefined) {
                copy.description = action.description;
            }
            if (action.category !== undefined) {
                copy.category = action.category;
            }
            if (action.gesture !== undefined) {
                copy.gesture = action.gesture;
            }
            if (action.settingsSchema) {
                copy.settingsSchema = action.settingsSchema.map(cloneJsonValue);
            }
            if (action.settingsSchemaVersion !== undefined) {
                copy.settingsSchemaVersion = action.settingsSchemaVersion;
            }
            return copy;
        });
        const instance = instanceId === undefined ? undefined : this.instances.get(instanceId);
        await streamDeck.ui.sendToPropertyInspector({
            type: "bridgeState",
            status: this.bridge.status,
            actions,
            ...(instance === undefined
                ? {}
                : {
                    controller: isDialAction(instance.action) ? "encoder" : "keypad",
                }),
            ...(this.bridge.status === "disconnected"
                ? { diagnostics: safeDiagnosticsSnapshot(this.bridge.diagnostics) }
                : {}),
        });
    }
}

const PLUGIN_VERSION = "0.1.0";
streamDeck.logger.info(`Starting Hammerspoon Stream Deck plugin v${PLUGIN_VERSION}`);
const bridge = new BridgeClient({
    url: "ws://localhost:17321/streamdeck",
    pluginVersion: PLUGIN_VERSION,
    logger: (line) => streamDeck.logger.info(line),
});
const hammerspoonToggle = new HammerspoonAction(bridge);
const hammerspoonButton = new HammerspoonAction(bridge, {
    manifestId: HAMMERSPOON_BUTTON_UUID,
    mode: "button",
});
const hammerspoonMultiState = new HammerspoonAction(bridge, {
    manifestId: HAMMERSPOON_MULTI_STATE_UUID,
    mode: "multi-state",
});
hammerspoonToggle.subscribe();
hammerspoonButton.subscribe();
hammerspoonMultiState.subscribe();
streamDeck.actions.registerAction(hammerspoonToggle);
streamDeck.actions.registerAction(hammerspoonButton);
streamDeck.actions.registerAction(hammerspoonMultiState);
bridge.start();
streamDeck.connect();

export { PLUGIN_VERSION };
//# sourceMappingURL=plugin.js.map
