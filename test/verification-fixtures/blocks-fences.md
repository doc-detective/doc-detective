# Fences

<!-- meta sha256-fb0e99becc5482adbcfc716db3278558c6551622ce81d7de2f0eecee01771f3f {"verified-by":[{"tool":"doc-detective","check":"fence-indented"}]} -->
   ```js
   install();
   ```js-extra
   more();
   ```

<!-- meta sha256-fe1af7ae81b763982245b3e42c11a3b8e81f1247519f25483282e92f3137888c {"verified-by":[{"tool":"doc-detective","check":"fence-info-string-line"}]} -->
```js
install();
```js-extra
more();
```

1. A step with a fence four spaces in.

    ```sh
    <!-- meta {"verified-by":[{"tool":"doc-detective","check":"in-four-spaces"}]} -->
    ```

2. A step with a fence seven spaces in.

       ```sh
       <!-- meta {"verified-by":[{"tool":"doc-detective","check":"in-seven-spaces"}]} -->
       ```

   ```md
   ```md-extra
   <!-- meta {"verified-by":[{"tool":"doc-detective","check":"in-a-fence-past-an-info-string"}]} -->
   ```

<!-- meta sha256-0e2078383d64c2f403a273d540d19f1740f65a8adb49fa002efac3e5a0b1fb0e {"verified-by":[{"tool":"doc-detective","check":"after-the-fences"}]} -->
The last paragraph.
