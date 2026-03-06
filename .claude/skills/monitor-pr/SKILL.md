---
name: monitor-pr
description: Monitor PR for CI failures and comments, act on comments if necessary, respond to comments, and resolve comment threads. Complete task after 3 consecutive PR checks with no new comments and passing CI.
---

Monitor the current PR for CI failures and comments using the `gh` CLI. For each comment, assess whether or not it should be acted upon, act upon it if necessary, respond to the comment in the comment thread, then resolve the comment thread. You must have 3 consecutive PR checks five minutes apart with no new comments and passing CI to complete your task. You must resolve all comment threads you respond to.
