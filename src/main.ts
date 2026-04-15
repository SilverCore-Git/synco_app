import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router';
import StarportPlugin from 'vue-starport'
import 'bootstrap-icons/font/bootstrap-icons.css';

const app = createApp(App);

app.use(router);

app.use(StarportPlugin());

app.mount('#app');
