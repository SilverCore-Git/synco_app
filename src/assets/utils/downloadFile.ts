import keycloak from "../keycloak";

export const downloadFile = (fileId: string) => {
    
    const link = document.createElement('a');
    link.href = `${import.meta.env.VITE_API_URL}/cdn/download/${fileId}?token=Bearer ${keycloak.token}`;
    
    link.target = '_blank'; 
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

};
