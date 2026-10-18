import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import App from './App.jsx';
import './styles.css';

class AppBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal-error"><h1>Let’s get you back on the road.</h1><p>The app could not finish loading. Refresh to reconnect. Your active ride is saved to your account.</p><button onClick={() => window.location.reload()}>Reload Keimoes Rides</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
