# Statement detection: Markdown

The built-in Markdown fileType reads HTML comments and every `[comment]: #`
quote variant as statements.

<!-- test {"testId": "detection-markdown-html-comments"} -->

Check the [docs server](http://localhost:8092).

<!-- step {"checkLink": "http://localhost:8092"} -->
<!-- step {"wait": 100} -->

<!-- test ignore start -->
If ignore ranges break, this unreachable request fails the run.
<!-- step {"httpRequest": {"url": "http://localhost:9/unreachable"}} -->
<!-- test ignore end -->

<!-- step {"wait": 50} -->

<!-- test end -->

[comment]: # (test {"testId": "detection-markdown-comment-defs"})

[comment]: # (step {"checkLink": "http://localhost:8092"})
[comment]: # 'step {"wait": 25}'
[comment]: # "step {\"wait\": 30}"

[comment]: # (test end)

The built-in regular expressions also read statements inside code fences, as
every release has; this fenced step runs:

<!-- test {"testId": "detection-markdown-fence-legacy"} -->

```html
<!-- step {"wait": 10} -->
```

<!-- step {"wait": 10} -->

<!-- test end -->
