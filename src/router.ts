import { createRouter, createWebHistory } from 'vue-router';


import OrgSelection from './views/OrgsSelection/OrgSelection.vue';
import OrgLayout from './views/OrgSpace/OrgLayout.vue';
import SpaceView from './views/OrgSpace/views/SpaceView.vue';
import OrgHome from './views/OrgSpace/views/OrgHome.vue';


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
    redirect: (to: any) => ({ name: 'OrgSpaceHome', params: { orgId: to.params.orgId } })
  },

  {
    path: '/org/:orgId/home',
    name: 'OrgSpaceHome',
    component: OrgLayout,
    props: true,
    meta: { title: 'SilverTeams' },
    children: [
      {
        path: 'home',
        name: 'OrgHome',
        props: true,
        component: OrgHome,
        meta: { title: 'SilverTeams' }
      },
      {
        path: 'space/:spaceId',
        name: 'SpaceDetail',
        component: SpaceView,
        props: true,
        meta: { title: 'SilverTeams' }
      }
    ]
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
