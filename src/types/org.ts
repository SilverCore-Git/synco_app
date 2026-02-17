export type OrgConfig = {
    maxNotesPerSpace: number;
    maxFileStoragePerSpace: number; // mo
    maxUsersPerSpace: number;
    maxTotalUsers: number;
}

export type OrgStats = {
    memberCount: number;
    onlineCount: number;
}


export interface Org {

    id: string;
    name: string;
    logo: string;

    stats: OrgStats;
    config: OrgConfig;

}


export interface OrgMember {
    user_id: string;
    org_id: string;
    role: string;  // 'owner' | 'admin' | 'moderator' | 'member'
    permissions: string[];
    encrypted_key?: string; // La clé d'org chiffrée avec la clé publique du user
}

export interface OrgMemberDisplay extends OrgMember {
    user: {
        username: string;
        avatar: string;
        status: 'online' | 'idle' | 'dnd' | 'offline';
    }
}