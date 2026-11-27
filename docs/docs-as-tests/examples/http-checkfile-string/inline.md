<!-- test {"testId":"http-checkfile-string","detectSteps":false} -->

# Check that a file exists

Write the release notes to the `output` folder next to this page:

```shell
node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/notes.txt','release notes')"
```

<!-- step {"runShell":{"command":"node -e \"const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/notes.txt','release notes')\"","workingDirectory":"."}} -->

Check that `output/notes.txt` exists.

<!-- step {"checkFile":"output/notes.txt"} -->

<!-- test end -->
