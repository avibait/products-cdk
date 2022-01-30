
import * as dynamo from '@aws-sdk/lib-dynamodb';
import * as dynamoClient from '@aws-sdk/client-dynamodb'

const ddbClient = new dynamoClient.DynamoDBClient({ region: 'us-east-1' });
// const marshallOptions = {
//   // Whether to automatically convert empty strings, blobs, and sets to `null`.
//   convertEmptyValues: false, // false, by default.
//   // Whether to remove undefined values while marshalling.
//   removeUndefinedValues: false, // false, by default.
//   // Whether to convert typeof object to map attribute.
//   convertClassInstanceToMap: false, // false, by default.
// };

// const unmarshallOptions = {
//   // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
//   wrapNumbers: false, // false, by default.
// };

// const translateConfig = { marshallOptions, unmarshallOptions };

const ddbDocClient = dynamo.DynamoDBDocumentClient.from(ddbClient, {});

//create responseObject
function Response(isBase64Encoded, statusCode, headers, multiValueHeaders, body) {
  this.isBase64Encoded = isBase64Encoded;
  this.statusCode = statusCode;
  this.headers = headers;
  this.multiValueHeaders = multiValueHeaders
  this.body = body;
}

//ts
// class Response {
// isBase64Encoded: boolean;
//  statusCode: number;
//   headers: object;
//   multiValueHeaders: object;
//   body:string;

//   constructor(isBase64Encoded: boolean,  statusCode: number, headers: object,   multiValueHeaders: object, body:string){
//   this.isBase64Encoded = isBase64Encoded;
//   this.statusCode = statusCode;
//   this.headers = headers;
//   this.multiValueHeaders = multiValueHeaders
//   this.body = body;
//   }
// }

export async function handler(event, context, callback) {

  let errorMessage = '';
  //helper functions
  const invalidName = (name) => {
    return name.length > 40;
  }
  const negativePrice = (price) => {
    return price < 0;
  }
  const blankTags = (tags) => {
    return tags.includes('');
  }

  try {
    //handle create products
    if (event.httpMethod === 'POST' && event.resource === '/products') {
      const body = JSON.parse(event.body);
      if (!body) {
        throw 'Please provide a valid formatted request in the body.'
      } else {
        if (invalidName(body.name)) {
          errorMessage = 'Product Name must not exceed 40 characters.';
        }
        if (negativePrice(body.price)) {
          errorMessage = 'Price must not be negative.';
        }
        if (blankTags(body.tags)) {
          errorMessage = 'Tags must not be blank.';
        }
        if (errorMessage) {
          return new Response(false, 400, {}, {}, errorMessage);
        } else {
          const randomId = (Date.now() + Math.random()).toFixed();
          const params = {
            Item: {
              id: randomId,
              name: body.name,
              price: body.price,
              tags: body.tags
            },
            TableName: process.env.DYNAMO_TABLE_NAME
          }
          const data = await ddbDocClient.send(new dynamo.PutCommand(params));
          if (data.$metadata.httpStatusCode === 200) {
            return new Response(false, 201, {}, {}, JSON.stringify(params.Item));
          } else {
            throw 'Unknown error inserting item into DynamoDB';
          }
        }
      }
    }

    //handle get product by Id
    if (event.httpMethod === 'GET' && event.resource === '/products/{productId}') {
      const productId = event.pathParameters.productId;
      if (!productId) {
        throw 'Please specify a Product Id';
      } else {
        const params = {
          Key: {
            "id": productId
          },
          TableName: process.env.DYNAMO_TABLE_NAME
        }
        const data = await ddbDocClient.send(new dynamo.GetCommand(params));
        return new Response(false, 200, {}, {}, JSON.stringify(data.Item));
      }
    }

    //handle search products by tags
    if (event.httpMethod === 'GET' && event.resource === '/products/search') {
      let tags = event.queryStringParameters?.tags;
      if (!tags) {
        errorMessage = 'Please specify at least one tag to filter by.'
      } else {
        tags = tags.split(',');
        const valuesObject = {};
        tags.forEach((t) => { valuesObject[`:${t}`] = t });
        let filter = ``;
        for (const tag in valuesObject) {
          console.log(tag)
          if (filter) {
            filter += ` AND `;
          } filter += `contains(tags, ${tag})`
        }

        const params = {
          FilterExpression: filter,
          ExpressionAttributeValues: valuesObject,
          TableName: process.env.DYNAMO_TABLE_NAME
        }

        let response;
        await ddbDocClient.send(new dynamo.ScanCommand(params))
          .then((data) => {
            response = response = {
              _records: data.Items
            }
            console.log(' in then block  DATA::: ' + JSON.stringify(data));
          })
          .catch((error) => {
            console.log('in catch block ::: ' + error);
            errorMessage = error
          });

        return new Response(false, 200, {}, {}, JSON.stringify(response))

      }

      if (errorMessage) {
        return new Response(false, 400, {}, {}, errorMessage);
      }
    }



  } catch (err) {
    console.log('in GENERAL catch block ' + err);
    return new Response(false, 400, {}, {}, JSON.stringify(err));
  }

  return new Response(false, 400, {}, {}, 'Invalid Request. Make sure you are using the correct method and endpoint')

}

