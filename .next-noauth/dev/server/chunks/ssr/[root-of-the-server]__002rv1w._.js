module.exports = [
"[next]/internal/font/google/inter_2fe1ab3d.js [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$module$2e$css__$5b$app$2d$rsc$5d$__$28$css__module$29$__ = __turbopack_context__.i("[next]/internal/font/google/inter_2fe1ab3d.module.css [app-rsc] (css module)");
;
const fontData = {
    className: __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$module$2e$css__$5b$app$2d$rsc$5d$__$28$css__module$29$__["default"].className,
    style: {
        fontFamily: "'Inter', 'Inter Fallback'",
        fontStyle: "normal"
    }
};
if (__TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$module$2e$css__$5b$app$2d$rsc$5d$__$28$css__module$29$__["default"].variable != null) {
    fontData.variable = __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$module$2e$css__$5b$app$2d$rsc$5d$__$28$css__module$29$__["default"].variable;
}
const __TURBOPACK__default__export__ = fontData;
}),
"[next]/internal/font/google/inter_2fe1ab3d.module.css [app-rsc] (css module)", ((__turbopack_context__) => {

__turbopack_context__.v({
  "className": "inter_2fe1ab3d-module__-T-KAq__className",
  "variable": "inter_2fe1ab3d-module__-T-KAq__variable",
});
}),
"[project]/src/app/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>RootLayout,
    "metadata",
    ()=>metadata,
    "viewport",
    ()=>viewport
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[next]/internal/font/google/inter_2fe1ab3d.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$site$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/site.ts [app-rsc] (ecmascript)");
;
;
;
;
const metadata = {
    metadataBase: new URL((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$site$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["siteUrl"])()),
    title: "Eterneon",
    description: "A personal AI operating system for running Eterneon Studio.",
    applicationName: "Eterneon",
    // Internal tool. It should never appear in a search index.
    robots: {
        index: false,
        follow: false
    },
    appleWebApp: {
        capable: true,
        title: "Eterneon",
        statusBarStyle: "black-translucent"
    },
    formatDetection: {
        telephone: false,
        address: false,
        email: false
    }
};
const viewport = {
    // cover lets the app paint under the notch and the home indicator; the
    // safe-area utilities keep content out from under them.
    viewportFit: "cover",
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    themeColor: [
        {
            media: "(prefers-color-scheme: dark)",
            color: "#1a1c1e"
        },
        {
            media: "(prefers-color-scheme: light)",
            color: "#f7fafb"
        }
    ]
};
/**
 * Runs before first paint, so a light-theme user never sees a frame of dark.
 * The store mirrors the stored theme into localStorage precisely so this can
 * run without waiting on IndexedDB, which resolves long after the first paint.
 */ const THEME_SCRIPT = `try{var t=localStorage.getItem("eterneon-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
function RootLayout({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("html", {
        lang: "en",
        "data-theme": "dark",
        className: __TURBOPACK__imported__module__$5b$next$5d2f$internal$2f$font$2f$google$2f$inter_2fe1ab3d$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"].variable,
        suppressHydrationWarning: true,
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("head", {
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("script", {
                    dangerouslySetInnerHTML: {
                        __html: THEME_SCRIPT
                    }
                }, void 0, false, {
                    fileName: "[project]/src/app/layout.tsx",
                    lineNumber: 68,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/layout.tsx",
                lineNumber: 67,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("body", {
                className: "antialiased",
                children: children
            }, void 0, false, {
                fileName: "[project]/src/app/layout.tsx",
                lineNumber: 70,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/layout.tsx",
        lineNumber: 61,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", (function(__turbopack_context__){

__turbopack_context__.n(__turbopack_context__.i("[project]/src/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/src/lib/site.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * The canonical origin, derived rather than hardcoded.
 *
 * The explicit variable comes first because the platform one can resolve to a
 * preview deployment, which would put the wrong host in every absolute URL the
 * app emits. Production is business.eterneon.net; eterneon.net itself is the
 * portfolio and is a different site.
 */ __turbopack_context__.s([
    "siteUrl",
    ()=>siteUrl
]);
function siteUrl() {
    const explicit = ("TURBOPACK compile-time value", "http://localhost:3000")?.trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    const platform = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (platform) return `https://${platform}`;
    return "http://localhost:3000";
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__002rv1w._.js.map