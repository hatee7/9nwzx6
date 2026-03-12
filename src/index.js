import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';  // глобальные стили (отключение зума и т.д.)

import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);