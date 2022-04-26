# This is a test file for doc-unit-test

It includes a few markdown styles, though file type doesn't really matter as long as it can be parsed as text.

1.  In the **Navigation** section, click **Open > File > Type**.

    // test {"action":"find", "text":"Navigation", "css":"", "wait":1000}
    // test {"action":"click", "text":"Open", "css":"#open .menu", "wait": 1000}
    // test {"action":"click", "text":"File", "css":"", "wait": 1000}
    // test {"action":"click", "text":"Type", "css":"", "wait": 1000}
    // test {"action":"sendKeys", "text":"Options field", "css":"", "keys":["this is a test", "ENTER"], "wait":1000}
    /* test {
        "action": "find",
        "text": "Navigation",
        "css": "",
        "wait": 1000
    } */
    /* test {
        "action": "sendKeys",
        "text": "Options field",
        "css": "",
        "keys": [
            "this is a test",
            "ENTER"
        ]
    } */