function login(request, session, config) {
    
    var credentials = request.Body.split("&")
        .map(function(item, index) {
            return item.split("=");
      }).reduce(function(p, c) {
             p[c[0]] = c[1];
             return p;
      }, {});
    
    var newRequest = {
      "Headers": {"Content-Type": "application/x-www-form-urlencoded"},
      "Method": "POST",
      "FormData": {
          grant_type: credentials.grant_type,
          client_id: credentials.client_id,
          client_secret: credentials.client_secret
      },
      "Domain": "https://keycloak-host",
      "resource": "/auth/realms/tyk/protocol/openid-connect/token",
    };

    var response = TykMakeHttpRequest(JSON.stringify(newRequest));
    var usableResponse = JSON.parse(response);
    
    // If error, return it to the client
    if (usableResponse.Code !== 200) {
      return TykJsResponse({
        Body: usableResponse.Body,
        Code: usableResponse.Code
      }, session.meta_data)
    }
    
    var bodyObj = JSON.parse(usableResponse.Body);
    var accessTokenComplete = bodyObj.access_token;
    var signature = accessTokenComplete.split(".")[2];
    log("completeAccessToken: " + accessTokenComplete);
    
    // create key inside Tyk
    createKeyInsideTyk(accessTokenComplete)
    
    // override response to client
    bodyObj.access_token = signature;
    delete bodyObj.refresh_expires_in;
    delete bodyObj.refresh_token;
    delete bodyObj.foo;
    
  var responseObject = {
    Body: JSON.stringify(bodyObj),
    Code: usableResponse.Code
  }
  return TykJsResponse(responseObject, session.meta_data)
}

function createKeyInsideTyk(jwt) {

    // add full access token to meta data
    var keyRequestBody = keyRequestTemplate;
    keyRequestBody.meta_data = {
        "jwt": jwt
    }
    
    // Gateway Create Custom Key API
    var domain = "http://localhost:8080";
    var resource = "/tyk/keys/" + jwt.split(".")[2];

    // Create the key via signature
    var newRequest = {
      "Headers": {
          "Content-Type": "application/json", 
          "x-tyk-authorization": "foo"
       },
      "Method": "POST",
      "Body": JSON.stringify(keyRequestBody),
      "Domain": domain,
      "resource": resource
    };
    
    var response = TykMakeHttpRequest(JSON.stringify(newRequest));
    log("createkeyintykres: " + response);
}

// TODO by you: access rights needs to be a bit more dynamic. e.g. work out the policy id & API ID etc... based on the metadata
// Add your org id if Tyk Pro
var keyRequestTemplate = {
    "apply_policies": [],
    "org_id" : "default",
    "expires": 0,
    "allowance": 0,
    "per": 0,
    "quota_max": 0,
    "rate": 0,
    "access_rights": {
        "basic-api": {
            "api_name": "Basic Protected API",
            "api_id": "basic-api",
            "versions": [
                "Default"
            ]
        }
    }
}