import { createRouter, createWebHistory } from 'vue-router';
import sfetch from './assets/utils/sfetch';


import OrgSelection from './views/OrgsSelection/OrgSelection.vue';
import OrgLayout from './views/OrgSpace/OrgLayout.vue';
import SpaceView from './views/OrgSpace/views/SpaceView.vue';
import OrgHome from './views/OrgSpace/views/OrgHome.vue';
import ChatView from './views/OrgSpace/views/ChatView.vue';
import GeneralSettings from './views/OrgSpace/views/settings/views/GeneralSettings.vue';
import SettingsLayout from './views/OrgSpace/views/settings/SettingsLayout.vue';
import MembersSettings from './views/OrgSpace/views/settings/views/MembersSettings.vue';
import WebhooksSettings from './views/OrgSpace/views/settings/views/WebhooksSettings.vue';
import InviteView from './views/inviteView.vue';
import ThreadLayout from './views/OrgSpace/views/ThreadLayout.vue';
import { nextTick } from 'vue';
import SpaceFiles from './views/OrgSpace/views/SpaceFiles.vue';
import AdminPanel from './views/AdminPanel.vue';


const routes = [

  {
    path: '/',
    name: 'OrgSelection',
    component: OrgSelection,
  },

  {
    path: '/root',
    name: 'AdminPanel',
    component: AdminPanel,
    redirect: '/root/users',
    beforeEnter: async (_to: any, _from: any, next: any) => {
      try {
        const res = await sfetch('/api/admin/isAdmin');
        if (res.ok) {
          const data = await res.json();
          if (data.isAdmin) return next();
        }
        return next('/');
      } catch (e) {
        return next('/');
      }
    },
    children: [
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('./views/admin/UsersQuota.vue'),
      },
      {
        path: 'orgs',
        name: 'AdminOrgs',
        component: () => import('./views/admin/OrgsQuota.vue'),
      },
      {
        path: 'support',
        name: 'AdminSupport',
        component: () => import('./views/admin/SupportAdmin.vue'),
      }
    ]
  },

  {
    path: '/invite/:code',
    name: 'InviteView',
    component: InviteView,
    props: true,
  },

  {
    path: '/invite/vocal/:code',
    name: 'GuestVoiceView',
    component: () => import('./views/GuestVoiceView.vue'),
    props: true,
  },

  {
    path: '/:orgId',
    redirect: (to: any) => ({ name: 'OrgHome', params: { orgId: to.params.orgId } })
  },

  {
    path: '/:orgId',
    name: 'OrgLayout',
    component: OrgLayout,
    props: true,
    children: [
      {
        path: 'home',
        name: 'OrgHome',
        props: true,
        component: OrgHome,
      },
      {
        path: 'settings',
        name: 'OrgSettings',
        props: true,
        component: SettingsLayout,
        
        children: [
          {
            path: 'general',
            name: 'OrgSettingsGeneral',
            props: true,
            component: GeneralSettings,
          },
          {
            path: 'members',
            name: 'OrgSettingsMembers',
            props: true,
            component: MembersSettings,
          },
          {
            path: 'webhooks',
            name: 'OrgSettingsWebhooks',
            props: true,
            component: WebhooksSettings,
          },
          {
            path: 'roles',
            name: 'OrgSettingsRoles',
            props: true,
            component: () => import('./views/OrgSpace/views/settings/views/RolesSettings.vue'),
          },
          {
            path: 'ai',
            name: 'OrgSettingsAI',
            props: true,
            component: () => import('./views/OrgSpace/views/settings/views/AISettings.vue'),
          },
          {
            path: 'storage',
            name: 'OrgSettingsStorage',
            props: true,
            component: () => import('./views/OrgSpace/views/settings/views/StorageSettings.vue'),
          }
        ]

      },
      {
        path: 'home/:threadId',
        name: 'OrgThreadHome',
        props: true,
        component: ThreadLayout,
      },
      {
        path: 'chat',
        name: 'OrgChat',
        props: true,
        component: ChatView,
      },
      {
        path: 'chat/:userId',
        name: 'OrgThreadChat',
        props: true,
        component: ChatView,
      },
      {
        path: 'chat/privateMeet/:userId',
        name: 'OrgThreadChatPrivateMeet',
        props: true,
        component: ChatView,
      },
      
      {
        path: ':spaceId',
        name: 'SpaceView',
        component: SpaceView,
        props: true,
      },
      {
        path: ':spaceId/:threadId',
        name: 'SpaceThreadView',
        component: ThreadLayout,
        props: true,
      },
      {
        path: ':spaceId/files',
        name: 'SpaceFiles',
        component: SpaceFiles,
        props: true,
      },
      {
        path: 'ai',
        name: 'OrgAI',
        component: () => import('./views/OrgSpace/views/OrgAI.vue'),
        props: true,
      },
      {
        path: 'tasks',
        name: 'TasksGlobal',
        component: () => import('./views/OrgSpace/views/TasksGlobal.vue'),
        props: true,
      },
      {
        path: ':spaceId/tasks',
        name: 'TasksSpace',
        component: () => import('./views/OrgSpace/views/TasksSpace.vue'),
        props: true,
      }

    ]
  },

  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }

]



const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, _savedPosition) 
  {

    if (to.hash && (to.hash.includes('state=') || to.hash.includes('access_token='))) 
    {
      return false;
    }

    if (to.hash) 
    {
      const el = document.querySelector(to.hash);
      if (el) return { top: (el as HTMLElement).offsetTop, behavior: 'smooth' };
    }

    return { top: 0 };

  }
});

router.beforeResolve((_to, _from) => {

  if (!document.startViewTransition) return;

  return new Promise((resolve) => {
    document.startViewTransition(async () => {
      resolve()
      await nextTick()
    })
  })
  
})

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
