# Games

This is a monorepo for card game applications. Currently WIP.

## Structure

- `api/` - Node.js/TypeScript backend with Socket.io for real-time communication
- `ui/` - React/TypeScript frontend with Three.js for 3D card rendering

## Development

```bash
# Install dependencies
npm install

# Start both servers
npm run dev

# Or start individually
npm run dev -w api
npm run dev -w ui
```

## Scripts

- `npm run dev` - Start both API and UI servers
- `npm run build` - Build both packages
- `npm run lint` - Lint all code
- `npm run format` - Format code with Prettier

## Environment Configuration

- API local config lives in [`api/.env.example`](/Users/christian/Desktop/Code/games/api/.env.example)
- UI local config lives in [`ui/.env.example`](/Users/christian/Desktop/Code/games/ui/.env.example)
- Deployed environments use GitHub Actions environment variables for `AWS_REGION`, `AWS_ROLE_ARN`, `DYNAMODB_TABLE_NAME`, `UI_ORIGIN`, `VITE_API_URL`, `API_INSTANCE_TYPE`, and `API_AMI_ID`

## AWS Deployment

- [`infra/dynamodb.yml`](/Users/christian/Desktop/Code/games/infra/dynamodb.yml) deploys the DynamoDB table
- [`infra/api-ec2.yml`](/Users/christian/Desktop/Code/games/infra/api-ec2.yml) deploys a small always-on EC2 host, SSM access, an artifact bucket for API releases, and a CloudFront HTTPS endpoint for browser traffic
- [`.github/workflows/infra-deployment.yml`](/Users/christian/Desktop/Code/games/.github/workflows/infra-deployment.yml) deploys the DynamoDB and EC2 stacks for `dev` and `prod`
- [`.github/workflows/api-deployment.yml`](/Users/christian/Desktop/Code/games/.github/workflows/api-deployment.yml) builds the API, uploads the release to S3, and deploys it to EC2 over SSM
- [`.github/workflows/ui-deployment.yml`](/Users/christian/Desktop/Code/games/.github/workflows/ui-deployment.yml) now injects `VITE_API_URL` at build time so GitHub Pages can point at the correct API origin
