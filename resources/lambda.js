
import * as dynamo from '@aws-sdk/lib-dynamodb';
import * as dynamoClient from '@aws-sdk/client-dynamodb'

const ddbClient = new dynamoClient.DynamoDBClient({ region: 'us-east-1' });
const ddbDocClient = dynamo.DynamoDBDocumentClient.from(ddbClient, {});

function Response(isBase64Encoded, statusCode, headers, multiValueHeaders, body) {
  this.isBase64Encoded = isBase64Encoded;
  this.statusCode = statusCode;
  this.headers = headers;
  this.multiValueHeaders = multiValueHeaders
  this.body = body;
}

export async function handler(event) {

  const invalidName = (name) => {
    return name.length > 40;
  }
  const invalidPrice = (price) => {
    return price < 0;
  }
  const invalidTags = (tags) => {
    return tags.some((t) => t.trim().length === 0)
  }

  if (event.httpMethod === 'POST' && event.resource === '/products') {
    const body = JSON.parse(event.body);
    if (invalidName(body.name)) {
      return new Response(false, 400, {}, {}, 'Product Name must not exceed 40 characters.');
    }
    if (invalidPrice(body.price)) {
      return new Response(false, 400, {}, {}, 'Price must not be negative.');
    }
    if (invalidTags(body.tags)) {
      return new Response(false, 400, {}, {}, 'Tags must not be blank.');
    }
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
    let success = false;
    let error;
    await ddbDocClient.send(new dynamo.PutCommand(params))
      .then(() => {
        success = true;
      })
      .catch((err) => {
        error = err;
      });
    if (success) {
      return new Response(false, 201, {}, {}, JSON.stringify(params.Item));
    } else {
      return new Response(false, 500, {}, {}, JSON.stringify(error));
    }
  }

  if (event.httpMethod === 'GET' && event.resource === '/products/{productId}') {
    const productId = event.pathParameters?.productId;
    if (!productId) {
      return new Response(false, 400, {}, {}, 'Please specify a Product Id');
    }
    const params = {
      Key: {
        "id": productId
      },
      TableName: process.env.DYNAMO_TABLE_NAME
    }
    let response;
    let error;
    await ddbDocClient.send(new dynamo.GetCommand(params))
      .then((data) => {
        response = data.Item ? data.Item : '';
      })
      .catch((err) => {
        error = err;
      });
    if (!response) {
      if (error) {
        return new Response(false, 400, {}, {}, error);
      }
      return new Response(false, 404, {}, {}, 'No products found');
    }
    return new Response(false, 200, {}, {}, JSON.stringify(response));
  }

  if (event.httpMethod === 'GET' && event.resource === '/products/search') {
    let tags = event.queryStringParameters?.tags;
    let errorMessage;
    let response;
    if (!tags) {
      errorMessage = 'Please specify at least one tag to filter by.'
    } else {
      tags = tags.split(',');
      const valuesObject = {};
      tags.forEach((t) => { valuesObject[`:${t}`] = t });
      let filter = ``;
      for (const tag in valuesObject) {
        if (filter) {
          filter += ` AND `;
        } filter += `contains(tags, ${tag})`
      }

      const params = {
        FilterExpression: filter,
        ExpressionAttributeValues: valuesObject,
        TableName: process.env.DYNAMO_TABLE_NAME
      }
      await ddbDocClient.send(new dynamo.ScanCommand(params))
        .then((data) => {
          response = response = {
            _records: data.Items
          }
        })
        .catch((error) => {
          errorMessage = error
        });
    }
    if (errorMessage) {
      return new Response(false, 400, {}, {}, errorMessage);
    }
    return new Response(false, 200, {}, {}, JSON.stringify(response))
  }

  return new Response(false, 400, {}, {}, 'Invalid Request. Make sure you are using the correct method and endpoint');
}