# Create an account with an API token

Keep the API address and your token in an `api.env` file next to this page:

```text
API_URL=http://localhost:8092/api
API_TOKEN=your-api-token
```

1. Load the variables from your `api.env` file.
2. Send a `POST` request to `$API_URL/accounts` with the header `Authorization: Bearer $API_TOKEN` and this body:

   ```json
   {"name": "Wren", "plan": "team", "seats": 5, "roles": ["admin", "billing"]}
   ```

   The API returns status `200` and the new account, with `plan` set to `team`. Note the account's `name`, its `seats`, and its first role.
3. Look up the account. Send a `GET` request to `$API_URL/accounts?name=<name>&seats=<seats>&role=<role>`. The response shows the same name, seat count, and role.
