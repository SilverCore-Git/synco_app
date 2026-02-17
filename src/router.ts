import { createRouter, createWebHistory } from 'vue-router';


import OrgSelection from './views/OrgsSelection/OrgSelection.vue';
import OrgLayout from './views/OrgSpace/OrgLayout.vue';
import SpaceView from './views/OrgSpace/views/SpaceView.vue';
import OrgHome from './views/OrgSpace/views/OrgHome.vue';
import OrgChat from './views/OrgSpace/views/OrgChat.vue';
import OrgCalendar from './views/OrgSpace/views/OrgCalendar.vue';


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
    redirect: (to: any) => ({ name: 'OrgHome', params: { orgId: to.params.orgId } })
  },

  {
    path: '/org/:orgId',
    name: 'OrgLayout',
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
        path: 'home/thread/:threadId',
        name: 'OrgThreadHome',
        props: true,
        component: OrgHome,
        meta: { title: 'SilverTeams' }
      },
      {
        path: 'chat',
        name: 'OrgChat',
        props: true,
        component: OrgChat,
        meta: { title: 'SilverTeams' }
      },
      {
        path: 'calendar',
        name: 'OrgCalendar',
        props: true,
        component: OrgCalendar,
        meta: { title: 'SilverTeams' }
      },
      {
        path: 'space/:spaceId',
        name: 'SpaceView',
        component: SpaceView,
        props: true,
        meta: { title: 'SilverTeams' },
      },
      {
        path: 'space/:spaceId/thread/:threadId',
        name: 'SpaceThreadView',
        component: SpaceView,
        props: true,
        meta: { title: 'SilverTeams' },
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
