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
