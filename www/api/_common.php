<?php
declare(strict_types=1);

const IMAGE_LIMIT_BYTES = 20 * 1024 * 1024;
const MODEL_LIMIT_BYTES = 80 * 1024 * 1024;

final class ApiException extends RuntimeException
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        $this->status = $status;
        parent::__construct($message);
    }
}

function root_dir(): string
{
    return dirname(__DIR__);
}

function data_dir(): string
{
    $override = getenv('CURIOSITY_DATA_DIR');
    if (is_string($override) && $override !== '') {
        return $override;
    }

    return root_dir() . '/data';
}

function items_dir(): string
{
    return data_dir() . '/items';
}

function tmp_dir(): string
{
    return data_dir() . '/.tmp';
}

function index_path(): string
{
    return data_dir() . '/index.json';
}

function lock_path(): string
{
    return data_dir() . '/.lock';
}

function item_dir(string $itemId): string
{
    return items_dir() . '/' . $itemId;
}

function meta_path(string $itemId): string
{
    return item_dir($itemId) . '/meta.json';
}

function admin_token(): string
{
    $token = getenv('CURIOSITY_ADMIN_TOKEN');
    return is_string($token) ? trim($token) : '';
}

function send_no_store_headers(): void
{
    header('Cache-Control: no-store');
}

function json_response(int $status, array $payload): never
{
    http_response_code($status);
    send_no_store_headers();
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function abort_request(int $status, string $message): never
{
    throw new ApiException($status, $message);
}

function handle_api(callable $handler): void
{
    try {
        ensure_storage();
        $handler();
    } catch (ApiException $exception) {
        json_response($exception->status, ['error' => $exception->getMessage()]);
    } catch (Throwable $exception) {
        error_log((string) $exception);
        json_response(500, ['error' => 'Une erreur interne est survenue.']);
    }
}

function ensure_storage(): void
{
    foreach ([data_dir(), items_dir(), tmp_dir()] as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Impossible de creer le dossier de stockage.');
        }
    }

    if (!is_file(index_path())) {
        write_json_atomic(index_path(), []);
    }
}

function require_method(string $expected): void
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method !== strtoupper($expected)) {
        abort_request(405, 'Methode non autorisee.');
    }
}

function require_admin_auth(): void
{
    $expectedToken = admin_token();
    if ($expectedToken === '') {
        return;
    }

    $providedToken = trim((string) ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? $_POST['admin_token'] ?? $_GET['admin_token'] ?? ''));
    if (!hash_equals($expectedToken, $providedToken)) {
        abort_request(401, 'Acces admin refuse.');
    }
}

function validate_item_id(string $itemId): string
{
    if (!preg_match('/^artifact-\d{8}-[a-f0-9]{8}$/', $itemId)) {
        abort_request(400, 'Identifiant d objet invalide.');
    }

    return $itemId;
}

function query_string(string $key): string
{
    $value = (string) ($_GET[$key] ?? '');
    if ($value === '') {
        abort_request(400, 'Parametre manquant.');
    }

    return $value;
}

function normalize_participant_id(?string $value): string
{
    return strtoupper(trim((string) $value));
}

function assert_participant_id(string $value): void
{
    if (!preg_match('/^[A-Z]{4}$/', $value)) {
        abort_request(400, 'Le code participant doit contenir exactement 4 lettres.');
    }
}

function text_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($value);
    }

    return strlen($value);
}

function normalize_text(?string $value, bool $required = false, int $maxLength = 500): ?string
{
    $normalized = trim(str_replace("\r\n", "\n", (string) $value));

    if ($required && $normalized === '') {
        abort_request(400, 'Veuillez remplir tous les champs obligatoires.');
    }

    if (text_length($normalized) > $maxLength) {
        abort_request(400, 'Un champ depasse la longueur autorisee.');
    }

    if (!$required && $normalized === '') {
        return null;
    }

    return $normalized;
}

function read_json_file(string $path): mixed
{
    $content = @file_get_contents($path);
    if ($content === false) {
        throw new RuntimeException('Impossible de lire un fichier JSON.');
    }

    $decoded = json_decode($content, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new RuntimeException('Le fichier JSON est invalide.');
    }

    return $decoded;
}

function read_index(): array
{
    $decoded = read_json_file(index_path());
    if (!is_array($decoded)) {
        throw new RuntimeException('index.json doit contenir une liste.');
    }

    usort($decoded, static function (array $left, array $right): int {
        return strcmp((string) ($right['submitted_at'] ?? $right['created_at'] ?? ''), (string) ($left['submitted_at'] ?? $left['created_at'] ?? ''));
    });

    return $decoded;
}

function write_json_atomic(string $path, array $payload): void
{
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        throw new RuntimeException('Impossible d encoder les donnees JSON.');
    }

    $tempPath = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (@file_put_contents($tempPath, $json . "\n", LOCK_EX) === false) {
        throw new RuntimeException('Impossible d ecrire le fichier JSON temporaire.');
    }

    if (!@rename($tempPath, $path)) {
        @unlink($tempPath);
        throw new RuntimeException('Impossible de finaliser l ecriture du fichier JSON.');
    }
}

function write_item_meta(string $itemId, array $entry): void
{
    write_json_atomic(meta_path($itemId), $entry);
}

function create_item_id(): string
{
    return 'artifact-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(4));
}

function create_unique_item_id(array $index): string
{
    $existingIds = [];
    foreach ($index as $entry) {
        if (isset($entry['id'])) {
            $existingIds[(string) $entry['id']] = true;
        }
    }

    $itemId = create_item_id();
    while (isset($existingIds[$itemId]) || is_dir(item_dir($itemId))) {
        $itemId = create_item_id();
    }

    return $itemId;
}

function detect_upload_error(array $upload, string $label): void
{
    $errorCode = (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE);

    if ($errorCode === UPLOAD_ERR_OK) {
        return;
    }

    if ($errorCode === UPLOAD_ERR_NO_FILE) {
        abort_request(400, $label === 'image' ? 'Veuillez joindre une image.' : 'Veuillez joindre un fichier GLB.');
    }

    if ($errorCode === UPLOAD_ERR_INI_SIZE || $errorCode === UPLOAD_ERR_FORM_SIZE) {
        abort_request(400, $label === 'image' ? 'L image depasse la taille maximale autorisee.' : 'Le fichier GLB depasse la taille maximale autorisee.');
    }

    abort_request(400, 'Le fichier televerse est invalide.');
}

function inspect_image_upload(array $upload): array
{
    detect_upload_error($upload, 'image');

    if ((int) ($upload['size'] ?? 0) > IMAGE_LIMIT_BYTES) {
        abort_request(400, 'L image depasse la taille maximale autorisee.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file((string) $upload['tmp_name']);
    $mimeMap = [
        'image/png' => '.png',
        'image/jpeg' => '.jpg',
        'image/webp' => '.webp',
    ];

    if (!isset($mimeMap[$mime])) {
        abort_request(400, 'Le fichier image n est pas dans un format accepte.');
    }

    return [
        'filename' => 'image' . $mimeMap[$mime],
        'mime' => $mime,
    ];
}

function inspect_model_upload(array $upload): array
{
    detect_upload_error($upload, 'model');

    if ((int) ($upload['size'] ?? 0) > MODEL_LIMIT_BYTES) {
        abort_request(400, 'Le fichier GLB depasse la taille maximale autorisee.');
    }

    $extension = strtolower(pathinfo((string) ($upload['name'] ?? ''), PATHINFO_EXTENSION));
    if ($extension !== 'glb') {
        abort_request(400, 'Le fichier GLB n est pas dans un format accepte.');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file((string) $upload['tmp_name']);
    $allowedMimes = ['application/octet-stream', 'model/gltf-binary', 'application/gltf-buffer'];

    if ($mime !== '' && !in_array($mime, $allowedMimes, true)) {
        abort_request(400, 'Le fichier GLB n est pas dans un format accepte.');
    }

    return [
        'filename' => 'model.glb',
        'mime' => $mime !== '' ? $mime : 'model/gltf-binary',
    ];
}

function move_uploaded_file_to(array $upload, string $destination): void
{
    $source = (string) ($upload['tmp_name'] ?? '');
    if ($source === '') {
        throw new RuntimeException('Le fichier temporaire est manquant.');
    }

    if (@move_uploaded_file($source, $destination)) {
        return;
    }

    if (@rename($source, $destination)) {
        return;
    }

    throw new RuntimeException('Impossible de deplacer le fichier televerse.');
}

function delete_tree(string $path): void
{
    if (!file_exists($path)) {
        return;
    }

    if (is_file($path) || is_link($path)) {
        @unlink($path);
        return;
    }

    $entries = scandir($path);
    if ($entries === false) {
        return;
    }

    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        delete_tree($path . '/' . $entry);
    }

    @rmdir($path);
}

function with_mutation_lock(callable $handler): mixed
{
    $handle = fopen(lock_path(), 'c+');
    if ($handle === false) {
        throw new RuntimeException('Impossible d ouvrir le verrou de mutation.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Impossible de verrouiller le stockage.');
        }

        return $handler();
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function create_public_item(array $entry): array
{
    return [
        'id' => $entry['id'],
        'name' => $entry['name'],
        'description' => $entry['description'],
        'author' => $entry['author'],
        'created_at' => $entry['created_at'],
        'has_model' => (bool) $entry['has_model'],
        'image_url' => '/api/media.php?' . http_build_query(['id' => $entry['id'], 'kind' => 'image']),
        'model_url' => !empty($entry['has_model']) ? '/api/media.php?' . http_build_query(['id' => $entry['id'], 'kind' => 'model']) : null,
    ];
}

function create_admin_item(array $entry): array
{
    return array_merge(create_public_item($entry), [
        'participant_id' => $entry['participant_id'],
        'submitted_at' => $entry['submitted_at'],
    ]);
}

function find_index_entry(array $index, string $itemId): ?array
{
    foreach ($index as $entry) {
        if (($entry['id'] ?? null) === $itemId) {
            return $entry;
        }
    }

    return null;
}

function find_index_entry_position(array $index, string $itemId): int
{
    foreach ($index as $position => $entry) {
        if (($entry['id'] ?? null) === $itemId) {
            return $position;
        }
    }

    return -1;
}

function public_item_or_404(string $itemId): array
{
    $entry = find_index_entry(read_index(), $itemId);
    if ($entry === null) {
        abort_request(404, 'Objet introuvable.');
    }

    return $entry;
}
