use std::thread;
use std::time::{Duration, Instant};

use rand::rngs::ThreadRng;
use rand::RngExt;
use tauri::{Emitter, PhysicalPosition, WebviewWindow};

const VELOCIDADE: f64 = 90.0; 
const INTERVALO: Duration = Duration::from_millis(16); 

enum Acao {
    Andar { alvo_x: f64, alvo_y: f64 },
    Descansar { pose: &'static str, ate: Instant },
}

pub fn iniciar(janela: WebviewWindow) {
    thread::spawn(move || {
        let mut rng = rand::rng();

        let inicio = janela.outer_position().unwrap();
        let mut x = inicio.x as f64;
        let mut y = inicio.y as f64;

        let mut acao = Acao::Descansar {
            pose: "idle",
            ate: Instant::now() + Duration::from_secs(2),
        };
        let mut animacao_atual = "idle";
        let mut ultimo_tick = Instant::now();

        loop {
            let agora = Instant::now();
            let dt = (agora - ultimo_tick).as_secs_f64();
            ultimo_tick = agora;

            let animacao = match acao {
                Acao::Andar { alvo_x, alvo_y } => {
                    let dx = alvo_x - x;
                    let dy = alvo_y - y;
                    let distancia = (dx * dx + dy * dy).sqrt();
                    let passo = VELOCIDADE * dt;

                    if distancia <= passo {
                        x = alvo_x;
                        y = alvo_y;
                        acao = escolher_descanso(&mut rng);
                    } else {
                        x += dx / distancia * passo;
                        y += dy / distancia * passo;
                    }
                    animacao_de_andar(dx, dy)
                }
                Acao::Descansar { pose, ate } => {
                    if agora >= ate {
                        acao = escolher_passeio(&janela, &mut rng);

                        if let Acao::Andar { alvo_x, alvo_y } = acao {
                            let angulo = (alvo_y - y).atan2(alvo_x - x).to_degrees();
                            janela.emit("direction", angulo).unwrap();
                        }
                    }
                    pose
                }
            };

            if animacao != animacao_atual {
                janela.emit("animation", animacao).unwrap();
                animacao_atual = animacao;
            }

            let posicao = PhysicalPosition::new(x.round() as i32, y.round() as i32);
            janela.set_position(posicao).unwrap();

            thread::sleep(INTERVALO);
        }
    });
}

fn escolher_passeio(janela: &WebviewWindow, rng: &mut ThreadRng) -> Acao {
    let monitor = janela.current_monitor().unwrap().unwrap();
    let area = monitor.work_area();
    let tamanho = janela.outer_size().unwrap();

    let min_x = area.position.x as f64;
    let min_y = area.position.y as f64;
    let max_x = min_x + area.size.width as f64 - tamanho.width as f64;
    let max_y = min_y + area.size.height as f64 - tamanho.height as f64;

    Acao::Andar {
        alvo_x: rng.random_range(min_x..=max_x),
        alvo_y: rng.random_range(min_y..=max_y),
    }
}

fn escolher_descanso(rng: &mut ThreadRng) -> Acao {
    let sorteio = rng.random_range(0..10);

    let (pose, segundos) = if sorteio < 6 {
        ("idle", rng.random_range(1.0..4.0))
    } else if sorteio < 9 {
        ("sit", rng.random_range(3.0..8.0))
    } else {
        ("sleep", rng.random_range(8.0..20.0))
    };

    Acao::Descansar {
        pose,
        ate: Instant::now() + Duration::from_secs_f64(segundos),
    }
}

fn animacao_de_andar(dx: f64, dy: f64) -> &'static str {
    const DIRECOES: [&str; 8] = [
        "walk_right",     
        "walk_down_right", 
        "walk_down",       
        "walk_down_left",  
        "walk_left",      
        "walk_up_left",    
        "walk_up",         
        "walk_up_right",   
    ];
    let angulo = dy.atan2(dx).to_degrees();
    let fatia = ((angulo + 22.5).rem_euclid(360.0) / 45.0) as usize;
    DIRECOES[fatia]
}
