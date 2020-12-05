## Split Token Flow using Tyk OSS Gateway

this walks you through launching Tyk to act as a broker between your clients and IdP, to hide the full JWT access tokens and only ever present the signature (opaque token) to the client.  Then we can use this opaque token to access APIs, where Tyk will reconstruct the JWT and send it to the upstream.

#### Prerequisites

Assumption is you have an IdP already running where you can exchange client id + secret for access token.  You should be able to do the following API call (or similar)


```
$ curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
https://authorization-server-hostname/auth/realms/tyk/protocol/openid-connect/token \
-d grant_type=client_credentials \
-d client_id=efd952c8-df3a-4cf5-98e6-868133839433 \
-d client_secret=0ede3532-f042-4120-bece-225e55a4a2d6

{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJlbWFpbCI6ImhlbGxvQHdvcmxkLmNvbSJ9.EwIaRgq4go4R2M2z7AADywZ2ToxG4gDMoG4SQ1X3GJ0",
  "expires_in": 300,
  "token_type": "bearer",
  "not-before-policy": 0,
  "scope": "email profile"
}
```

#### Instructions

1. Launch Tyk Gateway and Redis using Docker

```
docker-compose up
```

2.  Adding your IdP details
Modify the [login.js](./middleware/login.js) script that Tyk will execute, filling in the details with your IdP to recreate the above API call

3.  Reload the file
In order to load the changes we did in step 2, execute the following API call:

```
$ curl localhost:8080/tyk/reload -H "x-tyk-authorization:foo"
{"status":"ok","message":""}
```

4.  Make the same API call, through Tyk now
```
$ curl -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
http://localhost:8080/auth/token \
-d grant_type=client_credentials \
-d client_id=myclientid \
-d client_secret=5e7c5b4a-6a1c-4010-8219-897a0b45d08b

{
  "access_token": "EwIaRgq4go4R2M2z7AADywZ2ToxG4gDMoG4SQ1X3GJ0",
  "expires_in": 300,
  "not-before-policy": 0,
  "scope": "profile email",
  "session_state": "ab844564-265c-4bcd-8a73-5f46e92600bc",
  "token_type": "bearer"
}
```

We received a much smaller response this time, because the "access token" contained just the signature of the JWT access token that the Idp created.

When we called the "auth/token" endpoint, we called the "auth_api.json" reverse proxy configuration.  On the "token" endpoint on that "auth" api, we set up a Virtual Endpoint.  We see that in "auth_api.json"

```
"extended_paths": {
    "virtual": [
    {
        "response_function_name": "login",
        "function_source_type": "file",
        "function_source_uri": "./middleware/login.js",
        "path": "token",
        "method": "POST",
        "use_session": false,
        "proxy_on_error": false
    }
    ]
}
```

This is a Tyk built-in plugin that allows us to execute Javascript code on an endpoint.  This invoked our "login.js" script which we loaded into Tyk.

5.  Make api call using the opaque token returned in step 4

```
$ curl localhost:8080/basic-protected-api/get -H "Authorization:EwIaRgq4go4R2M2z7AADywZ2ToxG4gDMoG4SQ1X3GJ0"

{
  "args": {},
  "headers": {
    "Accept": "*/*",
    "Accept-Encoding": "gzip",
    "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJxUU5fTG5NaHk3emltSlNKRm9wVXYtWW0weEhMdlQ4eVRNSExQTGlYTk5FIn0.eyJleHAiOjE2MDcxNzgwNTgsImlhdCI6MTYwNzE3Nzc1OCwianRpIjoiOTJkN2M5NDEtZWE2YS00N2Y5LThlYTgtMTY1NWQ0YjIzOTgzIiwiaXNzIjoiaHR0cHM6Ly9rZXljbG9hay5kby5wb2MudHlrLnRlY2hub2xvZ3kvYXV0aC9yZWFsbXMvdHlrIiwiYXVkIjoiYWNjb3VudCIsInN1YiI6IjA0Mzc1YTE2LWMxMmItNDAwNi04MzBkLWExNTAzZTJjMWYxMCIsInR5cCI6IkJlYXJlciIsImF6cCI6Im15Y2xpZW50aWQiLCJzZXNzaW9uX3N0YXRlIjoiYWI4NDQ1NjQtMjY1Yy00YmNkLThhNzMtNWY0NmU5MjYwMGJjIiwiYWNyIjoiMSIsInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJvZmZsaW5lX2FjY2VzcyIsInVtYV9hdXRob3JpemF0aW9uIl19LCJyZXNvdXJjZV9hY2Nlc3MiOnsiYWNjb3VudCI6eyJyb2xlcyI6WyJtYW5hZ2UtYWNjb3VudCIsIm1hbmFnZS1hY2NvdW50LWxpbmtzIiwidmlldy1wcm9maWxlIl19fSwic2NvcGUiOiJwcm9maWxlIGVtYWlsIiwiY2xpZW50SWQiOiJteWNsaWVudGlkIiwiY2xpZW50SG9zdCI6IjE3Mi4xOC4wLjEiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsInByZWZlcnJlZF91c2VybmFtZSI6InNlcnZpY2UtYWNjb3VudC1teWNsaWVudGlkIiwiY2xpZW50QWRkcmVzcyI6IjE3Mi4xOC4wLjEifQ.EHLdSwmE4jg-GmELBT5C0FCvEZNMYIJ-OhdXXm97QsO9sQF51A-mH_Ebf__HJRnHgJ9BKYzuIdI1XO77iqflK-JYba1_BivnholKOO4YFsdLS9lTFaKJtq5MP-BQy7QQlN2x0pqj1s3MBaw2D9j8miHdLYqS3dWEv1kr5WkGsbukFA14sJVfMRVdFgQ-8U5X5_yDcOjKgR2bLRTgPYG6RWWRu3uJ6LQ-UbAMSaoykTKTmYCTWVHpkp_Bx_vXqEfjZQsT9c6hwwGM63q4uZhsFCM6oL51azKba0RiFFY-vbk1uCXybrrrlhYXgTKHd5aLTVyktTXsL9Tlnrenf5YIMQ",
    "Host": "httpbin.org",
    "User-Agent": "curl/7.64.1",
    "X-Amzn-Trace-Id": "Root=1-5fcb96a7-0299119443a2e1a019f21fff"
  },
  "origin": "192.168.144.1, 99.242.139.220",
  "url": "http://httpbin.org/get"
}
```

What's happened?

1.  We made an API call to the "basic-protected-api" listen path.
2.  Tyk validated the opaque token, which we created internally in step 4.
3.  We added another plugin to this API definition, to inject the token's meta data into the header.  
We can see that in "basic_protected_api.json":

```
"global_headers": {
          "Authorization": "Bearer $tyk_meta.jwt"
        },
```

Tyk injected the full JWT that we stored in step 4 into the header, replacing the one sent by the user, then made the API call to the upstream.  

4.  Our httpbin upstream echo'd our request, showing us what it received, which is the full Bearer token.