<?php
declare(strict_types=1);

require_once __DIR__ . '/_common.php';

handle_api(function () {
    require_method('POST');

    if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
        abort_request(400, 'Veuillez joindre une image.');
    }

    $participantId = normalize_participant_id($_POST['participant_id'] ?? null);
    assert_participant_id($participantId);

    $name = normalize_text($_POST['name'] ?? null, true, 120);
    $description = normalize_text($_POST['description'] ?? null, true, 512);
    $author = normalize_text($_POST['author'] ?? null, false, 120);
    $fictionalDate = normalize_text($_POST['fictional_date'] ?? null, false, 120);

    $imageUpload = $_FILES['image'];
    $imageInfo = inspect_image_upload($imageUpload, 'image');
    $imageUpload2 = isset($_FILES['image_2']) && is_array($_FILES['image_2']) ? $_FILES['image_2'] : null;
    $imageInfo2 = null;
    if ($imageUpload2 && (int) ($imageUpload2['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $imageInfo2 = inspect_image_upload($imageUpload2, 'image-2');
    }

    $result = with_mutation_lock(function () use ($participantId, $name, $description, $author, $fictionalDate, $imageUpload, $imageInfo, $imageUpload2, $imageInfo2): array {
        $index = read_index();

        if (!in_array($participantId, configured_participant_codes(), true)) {
            abort_request(403, 'Ce code participant n est pas autorise.');
        }

        $existingPosition = find_index_entry_position_by_participant($index, $participantId);
        $existingEntry = $existingPosition >= 0 ? $index[$existingPosition] : null;
        $itemId = is_array($existingEntry) ? (string) $existingEntry['id'] : create_unique_item_id($index);
        $directory = item_dir($itemId);
        $stagedImagePath = $directory . '/image.uploading';
        $imagePath = $directory . '/' . $imageInfo['filename'];
        $stagedImagePath2 = $imageInfo2 ? $directory . '/image-2.uploading' : null;
        $imagePath2 = $imageInfo2 ? $directory . '/' . $imageInfo2['filename'] : null;

        if (!is_dir($directory) && !mkdir($directory, 0775, false) && !is_dir($directory)) {
            throw new RuntimeException('Impossible de creer le dossier de l objet.');
        }

        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $entry = [
            'id' => $itemId,
            'participant_id' => $participantId,
            'name' => $name,
            'description' => $description,
            'author' => $author,
            'fictional_date' => $fictionalDate,
            'created_at' => $now->format('Y-m-d'),
            'submitted_at' => $now->format(DATE_ATOM),
            'has_model' => false,
            'image_filename' => $imageInfo['filename'],
            'image_mime' => $imageInfo['mime'],
            'image_2_filename' => $imageInfo2 ? $imageInfo2['filename'] : null,
            'image_2_mime' => $imageInfo2 ? $imageInfo2['mime'] : null,
            'model_filename' => null,
            'model_mime' => null,
        ];

        try {
            move_uploaded_file_to($imageUpload, $stagedImagePath);
            if ($imageInfo2 && $stagedImagePath2 !== null && $imageUpload2) {
                move_uploaded_file_to($imageUpload2, $stagedImagePath2);
            }

            foreach (scandir($directory) ?: [] as $entryName) {
                if ($entryName === '.' || $entryName === '..' || $entryName === 'image.uploading' || $entryName === 'image-2.uploading') {
                    continue;
                }

                delete_tree($directory . '/' . $entryName);
            }

            if (!@rename($stagedImagePath, $imagePath)) {
                @unlink($stagedImagePath);
                throw new RuntimeException('Impossible de finaliser l image televersee.');
            }

            if ($imageInfo2 && $stagedImagePath2 !== null && $imagePath2 !== null && !@rename($stagedImagePath2, $imagePath2)) {
                @unlink($stagedImagePath2);
                throw new RuntimeException('Impossible de finaliser la seconde image televersee.');
            }

            write_item_meta($itemId, $entry);
            if ($existingPosition >= 0) {
                array_splice($index, $existingPosition, 1);
            }
            array_unshift($index, $entry);
            write_json_atomic(index_path(), $index);
            return [
                'entry' => $entry,
                'created' => $existingEntry === null,
            ];
        } catch (Throwable $exception) {
            @unlink($stagedImagePath);
            if ($stagedImagePath2 !== null) {
                @unlink($stagedImagePath2);
            }
            if ($existingEntry === null) {
                delete_tree($directory);
            }
            throw $exception;
        }
    });

    json_response($result['created'] ? 201 : 200, [
        'item' => create_public_item($result['entry']),
        'message' => $result['created'] ? 'Contribution enregistree.' : 'Contribution remplacee.',
    ]);
});
