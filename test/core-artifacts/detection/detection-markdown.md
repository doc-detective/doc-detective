# Structural statement detection: Markdown

Comment containers replace the per-wrapper statement regexes: HTML comments
and every `[comment]: #` quote variant normalize to the same comment nodes.

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

Statements inside code fences must stay inert — this fence would fail the
run if the fenced comment were detected:

<!-- test {"testId": "detection-markdown-fence-inert"} -->

```html
<!-- step {"httpRequest": {"url": "http://localhost:9/unreachable"}} -->
```

<!-- step {"wait": 10} -->

<!-- test end -->
