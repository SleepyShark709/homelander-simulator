import './style.css';
import { Game } from './Game';
import { characterPreview } from './CharacterPreview';
try {
    if (new URLSearchParams(location.search).get('preview') === 'character') {
        characterPreview().catch((error) => {
            document.body.textContent = String(error);
        });
    } else {
        const game = new Game();
        import.meta.hot?.dispose(() => game.dispose());
        game.init().catch((error) => {
            console.error(error);
            game.ui.error(String(error));
        });
    }
} catch (error) {
    document.body.textContent = `无法启动 3D 引擎：${String(error)}。请使用启用硬件加速的现代电脑浏览器。`;
}
