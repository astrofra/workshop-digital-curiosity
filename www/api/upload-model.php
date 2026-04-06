<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function (): void {
    require_method('POST');

    if (!isset($_FILES['model']) || !is_array($_FILES['model'])) {
        abort_request(400, 'Veuillez joindre un fichier GLB.');
    }

    $itemId = validate_item_id(query_string('id'));
    $modelUpload = $_FILES['model'];
    $modelInfo = inspect_model_upload($modelUpload);

    $updatedEntry = with_mutation_lock(function () use ($itemId, $modelUpload, $modelInfo): array {
        $index = read_index();
        $entryPosition = find_index_entry_position($index, $itemId);

        if ($entryPosition === -1) {
            abort_request(404, 'Objet introuvable.');
        }

        $currentEntry = $index[$entryPosition];
        $directory = item_dir($itemId);
        if (!is_dir($directory)) {
            abort_request(404, 'Objet introuvable.');
        }

        $stagedPath = $directory . '/model.glb.uploading';
        $finalPath = $directory . '/' . $modelInfo['filename'];

        move_uploaded_file_to($modelUpload, $stagedPath);

        if (!@rename($stagedPath, $finalPath)) {
            @unlink($stagedPath);
            throw new RuntimeException('Impossible de finaliser le modele GLB.');
        }

        $updatedEntry = array_merge($currentEntry, [
            'has_model' => true,
            'model_filename' => $modelInfo['filename'],
            'model_mime' => $modelInfo['mime'],
        ]);

        write_item_meta($itemId, $updatedEntry);
        $index[$entryPosition] = $updatedEntry;
        write_json_atomic(index_path(), $index);

        return $updatedEntry;
    });

    json_response(200, [
        'item' => create_admin_item($updatedEntry),
        'message' => 'Modele GLB televerse.',
    ]);
});
