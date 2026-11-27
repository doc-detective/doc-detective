# Manage users

<!-- test {"testId":"structure-users-create","description":"Create a user.","detectSteps":false} -->

## Create a user

To create a user, send a `POST` request to `/api/users`:

```http
POST http://localhost:8092/api/users
Content-Type: application/json

{"name": "Ada"}
```

<!-- step {"stepId":"create-user","description":"Create the user Ada.","httpRequest":{"url":"http://localhost:8092/api/users","method":"post","request":{"headers":{"Content-Type":"application/json"},"body":{"name":"Ada"}},"response":{"body":{"name":"Ada"}},"statusCodes":[200]}} -->

<!-- test end -->

<!-- test {"description":"Look up a user by name.","detectSteps":false} -->

## Look up a user

To look up a user by name, send a `GET` request with a `name` parameter:

```http
GET http://localhost:8092/api/users?name=Ada
```

<!-- step {"stepId":"find-user","description":"Look up Ada by name.","httpRequest":{"url":"http://localhost:8092/api/users","method":"get","request":{"parameters":{"name":"Ada"}},"response":{"body":{"name":"Ada"}}}} -->

<!-- test end -->

<!-- test ignore start -->

## Delete a user

To delete a user, send a `DELETE` request:

```http
DELETE http://localhost:8092/api/users/ada
```

<!-- step {"httpRequest":{"url":"http://localhost:8092/api/users/ada","method":"delete"}} -->

<!-- test ignore end -->
