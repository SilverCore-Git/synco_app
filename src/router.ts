import { createRouter, createWebHistory } from 'vue-router';
import OrgSpace from './views/OrgSpace/OrgSpace.vue';
import OrgSelection from './views/OrgsSelection/OrgSelection.vue';


const routes = [

  {
    path: '/',
    redirect: '/org',
  },

  {
    path: '/org',
    name: 'OrgSelection',
    component: OrgSelection,
    meta: { title: 'SilverTeams' }
  },

  {
    path: '/org/:orgId',
    name: 'OrgSpace',
    component: OrgSpace,
    meta: { title: 'SilverTeams' }
  },

]



const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, _savedPosition) {
    if (to.hash) {
      const el = document.querySelector(to.hash);
      if (el) return { top: (el as HTMLElement).offsetTop, behavior: 'smooth' };
    }
    return { top: 0 };
  }
});

router.beforeEach((to: any, _from: any, next: any) => {
  const title = to.meta.title as string;

  if (title) {
    document.title = title;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', title);
    } else {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'og:title');
      meta.setAttribute('content', title);
      document.head.appendChild(meta);
    }
  }

  next();
});



export default router
