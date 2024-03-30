import time
import os
import queue
import threading
import logging
import sys

from process_pdf import PDFProcessor

class Assistant:
    def __init__(self, working_dir) -> None:
        self.work_queue = queue.Queue()
        self.done_queue = queue.Queue()
        self.dir = working_dir

        # configuration
        self.tick_period = 0.5
        self.debounce_delay = 1.0
        self.stats_print_period = 30.0

        self.processor = PDFProcessor()

    def start(self):
        threading.Thread(target=self.filemonitor, daemon=True).start()

        while True:
            (path, tstamp) = self.work_queue.get()

            # process_pdf returns True if:
            #  - no need to reply to anything
            #  - there was a need to reply and it succeeded
            # returns False if there was a need to reply and a failure to do so (e.g. network error)
            self.done_queue.put((path, tstamp, self.processor.process_pdf(path)))
            
            # this is just queue housekeeping, if the task failed (see above) we'll enqueue file again
            self.work_queue.task_done()

    def filemonitor(self):
        last_update_time_processed = {}
        enqueued = set()

        # TODO: log these occasionally
        total_enqueued = 0
        total_done = 0

        while True:
            # non-blocking read from done queue
            while True:
                try:
                    (path, tstamp, success) = self.done_queue.get_nowait()
                    if success:
                        last_update_time_processed[path] = tstamp
                        total_done += 1
                    # so that we can retry and enqueue again
                    enqueued.remove(path) 
                except queue.Empty:
                    break
                else:
                    self.done_queue.task_done()

            for root, dirs, files in os.walk(self.dir):
                for file in files:
                    if file.lower().endswith('.pdf'):
                        file_path = os.path.join(root, file)
                        last_processed_time = last_update_time_processed.get(file_path, 0)
                        last_update_time = os.stat(file_path).st_mtime_ns
                        debounce_cutoff = int(1e9 * (time.time() - self.debounce_delay)) 

                        # TODO: this is not correct in general, as time might, 
                        # for example, go backwards during clock adjustment
                        if last_processed_time < last_update_time and not file_path in enqueued:
                            if last_update_time > debounce_cutoff:
                                logging.info(f'{file_path} updated, waiting for debounce')
                                continue

                            total_enqueued += 1
                            self.work_queue.put((file_path, last_update_time))
                            enqueued.add(file_path)
                            continue

            time.sleep(self.tick_period)

if __name__ == "__main__":
    logging.basicConfig(format='%(asctime)s %(message)s', level=logging.INFO)
    if len(sys.argv) != 2:
        logging.error(f'usage: qna.py path/to/folder/to/monitor/')
    Assistant(sys.argv[1]).start()
