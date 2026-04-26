cd ../orders-lambda
mvn clean package

cd ../orders-lambda-cdk
npm install
npm run build
npx cdk deploy