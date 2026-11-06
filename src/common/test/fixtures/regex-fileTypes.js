/**
 * The built-in fileTypes as regex definitions, frozen as they were before 5.0
 * moved the built-ins to selectors (ADR 01158). Don't update them: they're the
 * baseline builtins.test.js compares the selector built-ins against, and they
 * keep regex definitions under test.
 */

const base = {
    asciidoc_1_0: {
        name: "asciidoc",
        extensions: ["adoc", "asciidoc", "asc"],
        inlineStatements: {
            testStart: ["\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"],
            testEnd: ["\\/\\/\\s+\\(\\s*test end\\s*\\)"],
            ignoreStart: ["\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"],
            ignoreEnd: ["\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"],
            step: ["\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"],
        },
        markup: [],
    },
    dita_1_0: {
        name: "dita",
        extensions: ["dita", "ditamap", "xml"],
        inlineStatements: {
            testStart: [
                "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
                "<!--\\s*test([\\s\\S]+?)-->",
                "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='test\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
                '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="test\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
                "<data\\s+[^>]*?value='test\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
                '<data\\s+[^>]*?value="test\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
            ],
            testEnd: [
                "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
                "<!--\\s*test end([\\s\\S]+?)-->",
                "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value=[\"']test end[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
                "<data\\s+[^>]*?value=[\"']test end[\"'][^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
            ],
            ignoreStart: [
                "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
                "<!--\\s*test ignore\\s+start\\s*-->",
            ],
            ignoreEnd: [
                "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
                "<!--\\s*test ignore\\s+end\\s*-->",
            ],
            step: [
                "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
                "<!--\\s*step([\\s\\S]+?)-->",
                '<data\\s+name="step"\\s*>([\\s\\S]*?)<\\/data>',
                "<data\\s+[^>]*?name=[\"']doc-detective[\"'][^>]*?value='step\\s+([^']+?)'[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
                '<data\\s+[^>]*?name=["\']doc-detective["\'][^>]*?value="step\\s+([^"]+?)"[^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
                "<data\\s+[^>]*?value='step\\s+([^']+?)'[^>]*?name=[\"']doc-detective[\"'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)",
                '<data\\s+[^>]*?value="step\\s+([^"]+?)"[^>]*?name=["\']doc-detective["\'][^>]*?(?:\\/\\s*>|>\\s*<\\/data>)',
            ],
        },
        markup: [
            {
                name: "clickUiControl",
                regex: [
                    "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?<uicontrol>([^<]+)<\\/uicontrol>",
                ],
                actions: ["click"],
            },
            {
                name: "typeIntoUiControl",
                regex: [
                    "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+<uicontrol>([^<]+)<\\/uicontrol>",
                ],
                actions: [
                    {
                        type: {
                            keys: "$1",
                            selector: "$2",
                        },
                    },
                ],
            },
            {
                name: "navigateToXref",
                regex: [
                    '(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
                ],
                actions: ["goTo"],
            },
            {
                name: "findUiControl",
                regex: ["<uicontrol>([^<]+)<\\/uicontrol>"],
                actions: ["find"],
            },
            {
                name: "verifyWindowTitle",
                regex: ["<wintitle>([^<]+)<\\/wintitle>"],
                actions: ["find"],
            },
            {
                name: "checkExternalXref",
                regex: [
                    '<xref\\s+[^>]*scope="external"[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
                    '<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*scope="external"[^>]*>',
                ],
                actions: ["checkLink"],
            },
            {
                name: "checkHyperlink",
                regex: ['<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
                actions: ["checkLink"],
            },
            {
                name: "checkLinkElement",
                regex: ['<link\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
                actions: ["checkLink"],
            },
            {
                name: "clickOnscreenText",
                regex: [
                    "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+<b>((?:(?!<\\/b>).)+)<\\/b>",
                ],
                actions: ["click"],
            },
            {
                name: "findOnscreenText",
                regex: ["<b>((?:(?!<\\/b>).)+)<\\/b>"],
                actions: ["find"],
            },
            {
                name: "goToUrl",
                regex: [
                    '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>',
                ],
                actions: ["goTo"],
            },
            {
                name: "typeText",
                regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
                actions: ["type"],
            },
        ],
    },
    html_1_0: {
        name: "html",
        extensions: ["html", "htm"],
        inlineStatements: {
            testStart: ["<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"],
            testEnd: ["<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"],
            ignoreStart: ["<!--\\s*test ignore start\\s*-->"],
            ignoreEnd: ["<!--\\s*test ignore end\\s*-->"],
            step: ["<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"],
        },
        markup: [],
    },
    markdown_1_0: {
        name: "markdown",
        extensions: ["md", "markdown", "mdx"],
        inlineStatements: {
            testStart: [
                "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
                "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
                "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
                "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
                "\\[comment\\]:\\s+#\\s+'test\\s*(.*?)\\s*'",
                "\\[comment\\]:\\s+#\\s+'test start\\s*(.*?)\\s*'",
                '\\[comment\\]:\\s+#\\s+"test\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
                '\\[comment\\]:\\s+#\\s+"test start\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
            ],
            testEnd: [
                "{\\/\\*\\s*test end\\s*\\*\\/}",
                "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
                "\\[comment\\]:\\s+#\\s+\\(test end\\)",
                "\\[comment\\]:\\s+#\\s+'test end'",
                '\\[comment\\]:\\s+#\\s+"test end"',
            ],
            ignoreStart: [
                "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
                "<!--\\s*test ignore start\\s*-->",
                "\\[comment\\]:\\s+#\\s+\\(test ignore start\\)",
                "\\[comment\\]:\\s+#\\s+'test ignore start'",
                '\\[comment\\]:\\s+#\\s+"test ignore start"',
            ],
            ignoreEnd: [
                "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
                "<!--\\s*test ignore end\\s*-->",
                "\\[comment\\]:\\s+#\\s+\\(test ignore end\\)",
                "\\[comment\\]:\\s+#\\s+'test ignore end'",
                '\\[comment\\]:\\s+#\\s+"test ignore end"',
            ],
            step: [
                "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
                "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
                "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
                "\\[comment\\]:\\s+#\\s+'step\\s*(.*?)\\s*'",
                '\\[comment\\]:\\s+#\\s+"step\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
            ],
        },
        markup: [
            {
                name: "checkHyperlink",
                regex: [
                    '(?<!\\!)\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
                ],
                actions: ["checkLink"],
            },
            {
                name: "clickOnscreenText",
                regex: [
                    "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+\\*\\*((?:(?!\\*\\*).)+)\\*\\*",
                ],
                actions: ["click"],
            },
            {
                name: "findOnscreenText",
                regex: ["\\*\\*((?:(?!\\*\\*).)+)\\*\\*"],
                actions: ["find"],
            },
            {
                name: "goToUrl",
                regex: [
                    '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
                ],
                actions: ["goTo"],
            },
            {
                name: "screenshotImage",
                regex: [
                    '!\\[[^\\]]*\\]\\(\\s*([^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)\\s*\\{(?=[^}]*\\.screenshot)[^}]*\\}',
                ],
                actions: ["screenshot"],
            },
            {
                name: "typeText",
                regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
                actions: ["type"],
            },
            {
                name: "httpRequestFormat",
                regex: [
                    "```(?:http)?\\r?\\n([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\r?\\n((?:[^\\s]+:\\s+[^\\s]+\\r?\\n)*)?(?:\\s+([\\s\\S]*?)\\r?\\n+)?```",
                ],
                actions: [
                    {
                        httpRequest: {
                            method: "$1",
                            url: "$2",
                            request: {
                                headers: "$3",
                                body: "$4",
                            },
                        },
                    },
                ],
            },
            {
                name: "runCode",
                regex: [
                    "```(bash|python|py|javascript|js)(?![^\\r\\n]*testIgnore)[^\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
                ],
                actions: [
                    {
                        unsafe: true,
                        runCode: {
                            language: "$1",
                            code: "$2",
                        },
                    },
                ],
            },
        ],
    },
};

export const REGEX_FILE_TYPES = {
  markdown: base.markdown_1_0,
  asciidoc: base.asciidoc_1_0,
  html: base.html_1_0,
  dita: base.dita_1_0,
};
