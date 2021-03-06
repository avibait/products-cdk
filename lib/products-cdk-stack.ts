import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway'

export class ProductsCdkStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'products', {
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING
      }
    });

    const lambdaFunction = new lambda.Function(this, 'productLambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: 'lambda.handler',
      code: lambda.Code.fromAsset('resources'),
      environment: {
        DYNAMO_TABLE_NAME: table.tableName
      }
    });
    table.grantReadWriteData(lambdaFunction);

    const apiGateway = new apigateway.LambdaRestApi(this, 'productAPI', {
      handler: lambdaFunction,
      proxy: false
    });

    const products = apiGateway.root.addResource('products');
    products.addMethod('POST');
    const getProduct = products.addResource('{productId}');
    getProduct.addMethod('GET');
    const searchProducts = products.addResource('search');
    searchProducts.addMethod('GET');
  }
}