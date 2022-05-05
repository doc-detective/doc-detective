# This is a test file for doc-unit-test

It includes a few markdown styles, though file type doesn't really matter as long as it can be parsed as text.

1.  In the **Navigation** section, click **Open > File > Type**.

    // test {"action":"open", "uri":"www.google.com"}
    // test {"action":"find", "element_text":"Navigation", "element_class":".open", "element_id":"#open"}
    // test {"action":"find", "element_xpath":"//*", "element_class":".open", "element_id":"#open"}
    // test {"action":"click", "text":"Open", "css":"#open .menu"}
    // test {"action":"wait"}
    // test {"action":"wait", "duration":"500"}
    // test {"action":"sendKeys", "css":"input", "keys":"this is a test"}
    // test {"action":"screenshot"}
    // test {"action":"screenshot", "filename":"test1.png"}
    // test {"action":"screenshot", "imageDirectory": "."}
    // test {"action":"screenshot", "imageDirectory": ".", "filename":"test2.png"}
    // test {"action":"recordStart"}
    // test {"action":"recordStop"}
    // test {"action":"recordStart", "filename":"test1.mp4"}
    // test {"action":"recordStop"}
    // test {"action":"recordStart", "imageDirectory": "."}
    // test {"action":"recordStop"}
    // test {"action":"recordStart", "imageDirectory": ".", "filename":"test2.mp4"}
    // test {"action":"recordStop"}
    // test {"action":"click", "text":"Type", "css":"", "wait": 1000}
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