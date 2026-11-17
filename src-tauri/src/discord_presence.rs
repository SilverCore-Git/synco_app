// Rich Presence Discord : affiche « Sur Synco » / « En appel vocal » sur le profil Discord de
// l'utilisateur, via l'IPC local du client Discord (socket Unix / named pipe Windows, aucun appel
// réseau depuis Synco). Piloté par le front (useDiscordPresence.ts), désactivé par défaut.
//
// Un seul thread détient la connexion : les commandes ne font que poster l'état voulu dans un
// canal, elles ne bloquent donc jamais la WebView, même si Discord met du temps à répondre ou
// n'est pas lancé. Le thread retente la connexion toutes les RETRY secondes tant qu'une présence
// est demandée, pour que lancer Discord après Synco suffise.
//
// L'ID d'application Discord (portail développeur) est injecté à la compilation par la variable
// d'environnement SYNCO_DISCORD_CLIENT_ID. Sans elle, la fonctionnalité est inerte et
// `discord_presence_available` renvoie false (le réglage est alors masqué côté front).
//
// Toujours déclarées (pas de #[cfg] sur les commandes) pour que `invoke_handler!` reste une liste
// unique valable sur toutes les cibles ; sur mobile elles ne font rien.

const CLIENT_ID: Option<&str> = option_env!("SYNCO_DISCORD_CLIENT_ID");

// Limite Discord sur details/state ; on borne aussi parce que la commande est appelable par tout
// script de la WebView.
const MAX_TEXT_CHARS: usize = 128;

#[derive(Clone, Debug)]
pub struct Presence {
    details: String,
    state: Option<String>,
    start: Option<i64>,
}

fn clamp(s: &str) -> String {
    s.chars().take(MAX_TEXT_CHARS).collect()
}

#[cfg(desktop)]
mod worker {
    use super::{Presence, CLIENT_ID};
    use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
    use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    const RETRY: Duration = Duration::from_secs(15);

    static TX: OnceLock<Mutex<Sender<Option<Presence>>>> = OnceLock::new();

    fn apply(client: &mut DiscordIpcClient, p: &Option<Presence>) -> bool {
        let res = match p {
            Some(p) => {
                let mut a = activity::Activity::new().details(p.details.as_str()).assets(
                    activity::Assets::new()
                        .large_image("synco")
                        .large_text("Synco"),
                );
                if let Some(s) = &p.state {
                    a = a.state(s.as_str());
                }
                if let Some(t) = p.start {
                    a = a.timestamps(activity::Timestamps::new().start(t));
                }
                client.set_activity(a)
            }
            None => client.clear_activity(),
        };
        res.is_ok()
    }

    fn run(client_id: &'static str, rx: std::sync::mpsc::Receiver<Option<Presence>>) {
        let mut client = DiscordIpcClient::new(client_id);
        let mut connected = false;
        let mut wanted: Option<Presence> = None;
        // Vrai quand l'état voulu n'a pas encore été poussé à Discord.
        let mut dirty = false;

        loop {
            match rx.recv_timeout(RETRY) {
                Ok(p) => {
                    wanted = p;
                    dirty = true;
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if !dirty {
                continue;
            }
            // Plus rien à afficher et pas connecté : inutile d'ouvrir une connexion pour effacer.
            if wanted.is_none() && !connected {
                dirty = false;
                continue;
            }
            if !connected {
                connected = client.connect().is_ok();
                if !connected {
                    continue; // Discord fermé : on retentera au prochain tour.
                }
            }
            if apply(&mut client, &wanted) {
                dirty = false;
            } else {
                // Discord a été fermé entre-temps : on repartira d'une connexion neuve.
                let _ = client.close();
                connected = false;
            }
        }
        if connected {
            let _ = client.clear_activity();
            let _ = client.close();
        }
    }

    pub fn send(p: Option<Presence>) -> Result<(), String> {
        let client_id = CLIENT_ID.filter(|s| !s.is_empty()).ok_or("Rich Presence non configurée")?;
        let tx = TX.get_or_init(|| {
            let (tx, rx) = channel();
            std::thread::Builder::new()
                .name("discord-presence".into())
                .spawn(move || run(client_id, rx))
                .expect("spawn discord-presence");
            Mutex::new(tx)
        });
        tx.lock().map_err(|e| e.to_string())?.send(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn discord_presence_available() -> bool {
    cfg!(desktop) && CLIENT_ID.is_some_and(|s| !s.is_empty())
}

#[tauri::command]
pub fn discord_presence_set(details: String, state: Option<String>, start: Option<i64>) -> Result<(), String> {
    let p = Presence {
        details: clamp(&details),
        state: state.as_deref().map(clamp).filter(|s| !s.is_empty()),
        start: start.filter(|t| *t > 0),
    };
    #[cfg(desktop)]
    {
        worker::send(Some(p))
    }
    #[cfg(not(desktop))]
    {
        let _ = p;
        Err("not supported on this platform".into())
    }
}

#[tauri::command]
pub fn discord_presence_clear() -> Result<(), String> {
    #[cfg(desktop)]
    {
        if !discord_presence_available() {
            return Ok(());
        }
        worker::send(None)
    }
    #[cfg(not(desktop))]
    {
        Err("not supported on this platform".into())
    }
}
